import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mail, AlertCircle, MessageSquare, Tag, Trash2,
    RefreshCw, Send, Edit3, Archive, ChevronDown, ChevronRight, Trophy,
    Clock, Bell, ExternalLink, Newspaper, Sparkles, Brain, Check, X, Undo2
} from 'lucide-react';
import { createDatabase } from '../db';
import { isGoogleConnected, requestGoogleAuth, isGoogleAuthAvailable } from '../services/google-auth';
import { syncGmailInbox, archiveMessage, unarchiveMessage, sendReply } from '../services/gmail';
import { classifyEmail, draftResponse, isClassifierAvailable } from '../services/email-classifier';
import { scoreAllEmails } from '../services/email-scorer';
import { detectNewsletters, getNewsletterSenders, bulkArchiveBySender, buildUnsubscribeAction, extractDomain } from '../services/newsletter-detector';
import { snoozeEmail, unsnoozeEmail } from '../services/email-snooze';
import { startSession, logAction, getSessionActions, getActionCount } from '../services/email-action-logger';
import { analyzeSession } from '../services/email-pattern-analyzer';
import { getRules, addRule, deleteRule, generatePendingActions, applyPendingAction, applyAllPending } from '../services/email-rules-engine';
import type { DetectedPattern } from '../services/email-pattern-analyzer';
import type { PendingAction } from '../services/email-rules-engine';
import type { NewsletterSender } from '../services/newsletter-detector';
import type { SnoozePreset } from '../services/email-snooze';
import type { Email, EmailTier, EmailStatus } from '../types/schema';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';
import { useInactivityTimer } from '../hooks/useInactivityTimer';
import { UnsubscribeSweep } from './UnsubscribeSweep';
import { PendingActionsBar } from './PendingActionsBar';

const TIER_CONFIG: Record<EmailTier, { label: string; icon: typeof AlertCircle; color: string; bgColor: string; bgLight: string; bgMedium: string }> = {
    urgent: { label: 'Urgent', icon: AlertCircle, color: 'text-red-400', bgColor: 'bg-red-500', bgLight: 'bg-red-500/20', bgMedium: 'bg-red-500/30' },
    important: { label: 'Important', icon: MessageSquare, color: 'text-blue-400', bgColor: 'bg-blue-500', bgLight: 'bg-blue-500/20', bgMedium: 'bg-blue-500/30' },
    promotions: { label: 'Promotions', icon: Tag, color: 'text-amber-400', bgColor: 'bg-amber-500', bgLight: 'bg-amber-500/20', bgMedium: 'bg-amber-500/30' },
    unsubscribe: { label: 'Unsubscribe', icon: Trash2, color: 'text-slate-400', bgColor: 'bg-slate-500', bgLight: 'bg-slate-500/20', bgMedium: 'bg-slate-500/30' },
};

const TIER_ORDER: EmailTier[] = ['urgent', 'important', 'promotions', 'unsubscribe'];

interface UndoEntry {
    id: string;
    type: 'archive' | 'reclassify' | 'snooze';
    emailId: string;
    gmailId: string;
    emailSubject: string;
    emailFrom: string;
    previousStatus: EmailStatus;
    previousTierOverride?: EmailTier;
    newTier?: EmailTier;
    ruleIdCreated?: string;
    timestamp: string;
}

interface ToastData {
    message: string;
    action?: {
        label: string;
        onAction: () => void;
    };
}

interface EmailSuggestion {
    patternId: string;
    description: string;
    action: 'archive' | 'reclassify';
    actionTier?: EmailTier;
}

export function EmailDashboard() {
    const [db] = useDatabase();
    const [emails] = useRxQuery<Email>(db?.emails, { sort: [{ received_at: 'desc' }] });
    const [isSyncing, setIsSyncing] = useState(false);
    const [expandedTiers, setExpandedTiers] = useState<Set<EmailTier>>(new Set(['urgent', 'important']));
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [draftText, setDraftText] = useState('');
    const [isDrafting, setIsDrafting] = useState(false);
    const [toast, setToast] = useState<ToastData | null>(null);
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const [showUndoHistory, setShowUndoHistory] = useState(false);
    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [newsletterSenders, setNewsletterSenders] = useState<NewsletterSender[]>([]);
    const [showNewsletters, setShowNewsletters] = useState(false);
    const [showSnoozed, setShowSnoozed] = useState(false);
    const [snoozeDropdownId, setSnoozeDropdownId] = useState<string | null>(null);
    const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [showSweep, setShowSweep] = useState(false);
    const [sessionActive, setSessionActive] = useState(false);
    const [detectedPatterns, setDetectedPatterns] = useState<DetectedPattern[]>([]);
    const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
    const [isApplyingPending, setIsApplyingPending] = useState(false);
    const [actionBadge, setActionBadge] = useState(0);
    const [emailSuggestions, setEmailSuggestions] = useState<Map<string, EmailSuggestion>>(new Map());

    // Helper: extract sender address
    const extractAddress = (from: string) => {
        const match = from.match(/<([^>]+)>/);
        return (match ? match[1] : from).toLowerCase().trim();
    };

    // Check if an email matches a pattern's criteria
    const matchesPattern = useCallback((email: Email, pattern: DetectedPattern): boolean => {
        const addr = extractAddress(email.from);
        switch (pattern.matchCriteria.field) {
            case 'domain':
                return extractDomain(addr) === pattern.matchCriteria.value;
            case 'sender':
                return addr === pattern.matchCriteria.value;
            case 'subject_contains':
                return email.subject.toLowerCase().includes(pattern.matchCriteria.value.toLowerCase());
            default:
                return false;
        }
    }, []);

    // Populate inline suggestions from detected patterns
    const populateSuggestions = useCallback((patterns: DetectedPattern[]) => {
        const activeEmails = emails.filter(e => e.status !== 'archived' && e.status !== 'snoozed');
        const suggestions = new Map<string, EmailSuggestion>();
        for (const email of activeEmails) {
            for (const pattern of patterns) {
                if (pattern.suggestedAction === 'archive' && email.status === 'archived') continue;
                if (pattern.suggestedAction === 'reclassify') {
                    const effectiveTier = email.tier_override || email.tier;
                    if (effectiveTier === pattern.suggestedTier) continue;
                }
                if (matchesPattern(email, pattern) && !suggestions.has(email.id)) {
                    suggestions.set(email.id, {
                        patternId: pattern.id,
                        description: pattern.description,
                        action: pattern.suggestedAction,
                        actionTier: pattern.suggestedTier,
                    });
                    break;
                }
            }
        }
        setEmailSuggestions(suggestions);
        return suggestions.size;
    }, [emails, matchesPattern]);

    // Inactivity timer — auto-prompt inline suggestions after 2 min idle
    const handleInactive = useCallback(() => {
        const count = getActionCount();
        if (count < 3) return;
        const patterns = analyzeSession(getSessionActions());
        if (patterns.length > 0) {
            setDetectedPatterns(patterns);
            populateSuggestions(patterns);
        }
    }, [populateSuggestions]);

    const { resetTimer } = useInactivityTimer(sessionActive, handleInactive);

    // Load newsletter senders when db is ready
    useEffect(() => {
        if (!db) return;
        getNewsletterSenders(db).then(setNewsletterSenders).catch(err => {
            console.error('[EmailDashboard] Failed to load newsletter senders:', err);
        });
    }, [db]);

    const showToast = (message: string, action?: { label: string; onAction: () => void }) => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setToast({ message, action });
        toastTimeoutRef.current = setTimeout(() => setToast(null), action ? 30000 : 2000);
    };

    // Log an email action and reset the inactivity timer
    const recordAction = (email: Email, action: 'archive' | 'reclassify' | 'snooze' | 'reply' | 'draft', newTier?: EmailTier, snoozePreset?: string) => {
        const addr = extractAddress(email.from);
        logAction({
            emailId: email.id,
            gmailId: email.gmail_id,
            action,
            from: email.from,
            domain: extractDomain(addr),
            subject: email.subject,
            tier: email.tier_override || email.tier,
            newTier,
            snoozePreset,
        });
        setActionBadge(getActionCount());
        resetTimer();
    };

    const handleSync = async () => {
        if (!isGoogleConnected()) {
            try {
                await requestGoogleAuth();
            } catch {
                return;
            }
        }

        setIsSyncing(true);
        try {
            const db = await createDatabase();
            const { newCount, nextPageToken: token } = await syncGmailInbox(db, classifyEmail);
            setNextPageToken(token);
            await scoreAllEmails(db);
            await detectNewsletters(db);
            setNewsletterSenders(await getNewsletterSenders(db));
            showToast(newCount > 0 ? `Synced ${newCount} new emails` : 'Inbox up to date');
            // Start intelligence session if not active
            if (!sessionActive) {
                startSession();
                setSessionActive(true);
            }
            // Check rules against new emails
            const rules = getRules();
            if (rules.length > 0) {
                const allEmails = await db.emails.find({ sort: [{ received_at: 'desc' }] }).exec();
                const active = allEmails.filter((e: Email) => e.status !== 'archived' && e.status !== 'snoozed');
                setPendingActions(generatePendingActions(active.map((d: any) => d.toJSON ? d.toJSON() : d)));
            }
        } catch (err) {
            console.error('[EmailDashboard] Sync failed:', err);
            showToast('Sync failed');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleLoadMore = async () => {
        if (!nextPageToken || isLoadingMore) return;
        setIsLoadingMore(true);
        try {
            const db = await createDatabase();
            const { newCount, nextPageToken: token } = await syncGmailInbox(db, classifyEmail, 100, nextPageToken);
            setNextPageToken(token);
            await scoreAllEmails(db);
            await detectNewsletters(db);
            setNewsletterSenders(await getNewsletterSenders(db));
            showToast(newCount > 0 ? `Loaded ${newCount} more emails` : 'No new emails');
        } catch (err) {
            console.error('[EmailDashboard] Load more failed:', err);
            showToast('Load more failed');
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleArchive = async (email: Email) => {
        const previousStatus = email.status as EmailStatus;
        try {
            if (isGoogleConnected()) {
                await archiveMessage(email.gmail_id);
            }
            const db = await createDatabase();
            const doc = await db.emails.findOne(email.id).exec();
            if (doc) await doc.patch({ status: 'archived', updated_at: new Date().toISOString() });
            recordAction(email, 'archive');
            const entry: UndoEntry = {
                id: crypto.randomUUID(), type: 'archive',
                emailId: email.id, gmailId: email.gmail_id,
                emailSubject: email.subject, emailFrom: email.from,
                previousStatus, timestamp: new Date().toISOString(),
            };
            setUndoStack(prev => [...prev, entry]);
            showToast('Archived', { label: 'Undo', onAction: () => handleUndo(entry) });
        } catch (err) {
            console.error('[EmailDashboard] Archive failed:', err);
        }
    };

    const handleReclassify = async (email: Email, newTier: EmailTier) => {
        const previousTierOverride = (email.tier_override || undefined) as EmailTier | undefined;
        try {
            const database = db || await createDatabase();
            let doc = await database.emails.findOne(email.id).exec();
            if (!doc) {
                doc = await database.emails.findOne({ selector: { gmail_id: email.gmail_id } }).exec();
            }
            if (doc) {
                await doc.patch({ tier_override: newTier, updated_at: new Date().toISOString() });
                setSelectedEmail({ ...email, tier_override: newTier });
                recordAction(email, 'reclassify', newTier);
                const entry: UndoEntry = {
                    id: crypto.randomUUID(), type: 'reclassify',
                    emailId: email.id, gmailId: email.gmail_id,
                    emailSubject: email.subject, emailFrom: email.from,
                    previousStatus: email.status as EmailStatus,
                    previousTierOverride, newTier,
                    timestamp: new Date().toISOString(),
                };
                setUndoStack(prev => [...prev, entry]);
                showToast(`Moved to ${TIER_CONFIG[newTier].label}`, { label: 'Undo', onAction: () => handleUndo(entry) });
            } else {
                console.error('[EmailDashboard] Reclassify: email not found in DB', email.id);
                showToast('Failed to reclassify');
            }
        } catch (err) {
            console.error('[EmailDashboard] Reclassify failed:', err);
            showToast('Failed to reclassify');
        }
    };

    const handleDraftAI = async (email: Email) => {
        setIsDrafting(true);
        try {
            const draft = await draftResponse(email.from, email.subject, email.snippet);
            if (draft) {
                setDraftText(draft);
                const db = await createDatabase();
                const doc = await db.emails.findOne(email.id).exec();
                if (doc) await doc.patch({ ai_draft: draft, status: 'drafted', updated_at: new Date().toISOString() });
                recordAction(email, 'draft');
            }
        } finally {
            setIsDrafting(false);
        }
    };

    const handleSend = async (email: Email) => {
        if (!draftText.trim()) return;
        try {
            await sendReply(
                email.thread_id || email.gmail_id,
                email.from,
                `Re: ${email.subject}`,
                draftText
            );
            const db = await createDatabase();
            const doc = await db.emails.findOne(email.id).exec();
            if (doc) await doc.patch({ status: 'replied', updated_at: new Date().toISOString() });
            recordAction(email, 'reply');
            setSelectedEmail(null);
            setDraftText('');
            showToast('Reply sent');
        } catch (err) {
            console.error('[EmailDashboard] Send failed:', err);
            showToast('Failed to send');
        }
    };

    const handleSnooze = async (email: Email, preset: SnoozePreset) => {
        const previousStatus = email.status as EmailStatus;
        try {
            const db = await createDatabase();
            await snoozeEmail(db, email.id, preset);
            recordAction(email, 'snooze', undefined, preset);
            setSnoozeDropdownId(null);
            setSelectedEmail(null);
            const entry: UndoEntry = {
                id: crypto.randomUUID(), type: 'snooze',
                emailId: email.id, gmailId: email.gmail_id,
                emailSubject: email.subject, emailFrom: email.from,
                previousStatus, timestamp: new Date().toISOString(),
            };
            setUndoStack(prev => [...prev, entry]);
            showToast('Email snoozed', { label: 'Undo', onAction: () => handleUndo(entry) });
        } catch (err) {
            console.error('[EmailDashboard] Snooze failed:', err);
        }
    };

    const handleUnsnooze = async (email: Email) => {
        try {
            const db = await createDatabase();
            await unsnoozeEmail(db, email.id);
            showToast('Email unsnoozed');
        } catch (err) {
            console.error('[EmailDashboard] Unsnooze failed:', err);
        }
    };

    const handleUndo = async (entry: UndoEntry) => {
        try {
            const database = db || await createDatabase();
            const doc = await database.emails.findOne(entry.emailId).exec();
            if (!doc) { showToast('Email not found'); return; }

            switch (entry.type) {
                case 'archive':
                    if (isGoogleConnected()) await unarchiveMessage(entry.gmailId);
                    await doc.patch({ status: entry.previousStatus, updated_at: new Date().toISOString() });
                    break;
                case 'reclassify':
                    await doc.patch({
                        tier_override: entry.previousTierOverride ?? undefined,
                        updated_at: new Date().toISOString(),
                    });
                    break;
                case 'snooze':
                    await unsnoozeEmail(database, entry.emailId);
                    break;
            }

            if (entry.ruleIdCreated) deleteRule(entry.ruleIdCreated);

            setUndoStack(prev => prev.filter(e => e.id !== entry.id));
            showToast('Undone');
        } catch (err) {
            console.error('[EmailDashboard] Undo failed:', err);
            showToast('Undo failed');
        }
    };

    const handleBulkArchive = async (senderAddress: string) => {
        try {
            const db = await createDatabase();
            const count = await bulkArchiveBySender(db, senderAddress);
            setNewsletterSenders(await getNewsletterSenders(db));
            showToast(`Archived ${count} emails`);
        } catch (err) {
            console.error('[EmailDashboard] Bulk archive failed:', err);
        }
    };

    // --- Intelligence handlers ---
    const handleOpenReview = () => {
        const patterns = analyzeSession(getSessionActions());
        if (patterns.length === 0) {
            showToast('No patterns detected yet');
            return;
        }
        setDetectedPatterns(patterns);
        const count = populateSuggestions(patterns);
        showToast(count > 0 ? `${count} suggestion${count !== 1 ? 's' : ''} on emails` : 'No matching emails');
    };

    const handleAcceptSuggestion = async (email: Email) => {
        const suggestion = emailSuggestions.get(email.id);
        if (!suggestion) return;
        // Create rule from the source pattern
        const pattern = detectedPatterns.find(p => p.id === suggestion.patternId);
        let ruleId: string | undefined;
        if (pattern) {
            const rule = addRule(pattern);
            ruleId = rule.id;
        }
        // Apply the action
        if (suggestion.action === 'archive') {
            await handleArchive(email);
        } else if (suggestion.action === 'reclassify' && suggestion.actionTier) {
            await handleReclassify(email, suggestion.actionTier);
        }
        // Patch ruleIdCreated into the most recent undo entry (just pushed by handleArchive/handleReclassify)
        if (ruleId) {
            setUndoStack(prev => {
                const copy = [...prev];
                if (copy.length > 0) copy[copy.length - 1].ruleIdCreated = ruleId;
                return copy;
            });
        }
        // Remove this suggestion
        setEmailSuggestions(prev => {
            const next = new Map(prev);
            next.delete(email.id);
            return next;
        });
    };

    const handleRejectSuggestion = (emailId: string) => {
        setEmailSuggestions(prev => {
            const next = new Map(prev);
            next.delete(emailId);
            return next;
        });
    };

    const handleAcceptAllSuggestions = async () => {
        // Create rules for all unique patterns
        const patternIds = new Set<string>();
        emailSuggestions.forEach(s => patternIds.add(s.patternId));
        for (const pid of patternIds) {
            const pattern = detectedPatterns.find(p => p.id === pid);
            if (pattern) addRule(pattern);
        }
        // Apply actions
        let count = 0;
        for (const [emailId, suggestion] of emailSuggestions) {
            const email = emails.find(e => e.id === emailId);
            if (!email) continue;
            try {
                if (suggestion.action === 'archive') {
                    await handleArchive(email);
                } else if (suggestion.action === 'reclassify' && suggestion.actionTier) {
                    await handleReclassify(email, suggestion.actionTier);
                }
                count++;
            } catch (err) {
                console.error('[EmailDashboard] Accept all suggestion failed:', err);
            }
        }
        setEmailSuggestions(new Map());
        showToast(`Applied ${count} suggestion${count !== 1 ? 's' : ''}`);
    };

    const handleDismissAllSuggestions = () => {
        setEmailSuggestions(new Map());
    };

    const handleApplyAllPending = async () => {
        if (!db) return;
        setIsApplyingPending(true);
        try {
            const count = await applyAllPending(db, pendingActions);
            setPendingActions([]);
            showToast(`Applied ${count} action${count !== 1 ? 's' : ''}`);
        } catch (err) {
            console.error('[EmailDashboard] Apply all pending failed:', err);
            showToast('Failed to apply actions');
        } finally {
            setIsApplyingPending(false);
        }
    };

    const handleApplyOnePending = async (action: PendingAction) => {
        if (!db) return;
        try {
            await applyPendingAction(db, action);
            setPendingActions(prev => prev.filter(a => a.emailId !== action.emailId));
            showToast('Action applied');
        } catch (err) {
            console.error('[EmailDashboard] Apply pending failed:', err);
        }
    };

    const handleDismissOnePending = (action: PendingAction) => {
        setPendingActions(prev => prev.filter(a => a.emailId !== action.emailId));
    };

    const handleDismissAllPending = () => {
        setPendingActions([]);
    };

    const toggleTier = (tier: EmailTier) => {
        setExpandedTiers(prev => {
            const next = new Set(prev);
            if (next.has(tier)) next.delete(tier);
            else next.add(tier);
            return next;
        });
    };

    // Group emails by effective tier (tier_override takes precedence)
    const emailsByTier = new Map<EmailTier, Email[]>();
    for (const tier of TIER_ORDER) emailsByTier.set(tier, []);
    for (const email of emails) {
        if (email.status === 'archived' || email.status === 'snoozed') continue;
        const effectiveTier = email.tier_override || email.tier;
        emailsByTier.get(effectiveTier)?.push(email);
    }
    for (const tier of TIER_ORDER) {
        emailsByTier.get(tier)?.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    const snoozedEmails = emails.filter(e => e.status === 'snoozed');
    const totalActive = emails.filter(e => e.status !== 'archived' && e.status !== 'replied' && e.status !== 'snoozed').length;
    const processedCount = emails.filter(e => e.status === 'archived' || e.status === 'replied').length;
    const inboxZeroProgress = emails.length > 0 ? (processedCount / emails.length) * 100 : 0;

    // Render an email card with optional inline suggestion
    const renderEmailCard = (email: Email) => {
        const suggestion = emailSuggestions.get(email.id);
        return (
            <motion.div
                key={email.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-3"
            >
                <div
                    className={`flex items-start gap-2 py-2 px-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer group ${email.status === 'unread' ? 'border-l-2 border-blue-400' : 'border-l-2 border-transparent'}`}
                    onClick={() => {
                        setSelectedEmail(email);
                        setDraftText(email.ai_draft || '');
                    }}
                >
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium truncate ${email.status === 'unread' ? 'text-white' : 'text-slate-400'}`}>
                                {email.from.split('<')[0].trim()}
                            </span>
                            {email.score != null && (
                                <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                                    email.score >= 70 ? 'bg-red-500/20 text-red-400' :
                                    email.score >= 40 ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                }`}>
                                    {email.score}
                                </span>
                            )}
                            <span className="text-[10px] text-slate-600">
                                {new Date(email.received_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                        <p className={`text-xs truncate mt-0.5 ${email.status === 'unread' ? 'text-slate-300' : 'text-slate-500'}`}>
                            {email.subject}
                        </p>
                        <p className="text-[10px] text-slate-600 truncate">{email.snippet}</p>
                    </div>
                    {/* Quick Actions — tier reclassify + archive */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {TIER_ORDER.map(t => {
                            const cfg = TIER_CONFIG[t];
                            const TierIcon = cfg.icon;
                            const effectiveTier = (email.tier_override || email.tier) as EmailTier;
                            const isCurrent = effectiveTier === t;
                            return (
                                <button
                                    key={t}
                                    onClick={e => { e.stopPropagation(); if (!isCurrent) handleReclassify(email, t); }}
                                    className={`p-1 rounded transition-colors ${isCurrent ? cfg.bgLight : 'hover:bg-white/10'}`}
                                    title={isCurrent ? `Current: ${cfg.label}` : `Move to ${cfg.label}`}
                                >
                                    <TierIcon className={`w-3 h-3 ${isCurrent ? cfg.color : 'text-slate-600 hover:' + cfg.color}`} />
                                </button>
                            );
                        })}
                        <div className="w-px h-3 bg-white/10 mx-0.5" />
                        <button
                            onClick={e => { e.stopPropagation(); handleArchive(email); }}
                            className="p-1 hover:bg-white/10 rounded"
                            title="Archive"
                        >
                            <Archive className="w-3 h-3 text-slate-400" />
                        </button>
                    </div>
                </div>
                {/* Inline suggestion strip */}
                {suggestion && (
                    <div
                        className="flex items-center gap-2 mx-2 mb-1 px-2 py-1.5 bg-purple-500/10 rounded border border-purple-500/20"
                        onClick={e => e.stopPropagation()}
                    >
                        <Brain className="w-3 h-3 text-purple-400 flex-shrink-0" />
                        <span className="text-[10px] text-purple-300 flex-1 truncate">
                            {suggestion.description}
                        </span>
                        <button
                            onClick={() => handleAcceptSuggestion(email)}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-500/20 hover:bg-purple-500/30 rounded text-[9px] text-purple-300 font-medium transition-colors"
                        >
                            <Check className="w-2.5 h-2.5" /> Accept
                        </button>
                        <button
                            onClick={() => handleRejectSuggestion(email.id)}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 hover:bg-white/10 rounded text-[9px] text-slate-500 transition-colors"
                        >
                            <X className="w-2.5 h-2.5" /> Skip
                        </button>
                    </div>
                )}
            </motion.div>
        );
    };

    return (
        <div className="flex flex-col h-full text-white overflow-hidden">
            {/* Header — pinned at top */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-bold">Email Triage</span>
                    {totalActive > 0 && (
                        <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded-full">
                            {totalActive}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {sessionActive && (
                        <button
                            onClick={handleOpenReview}
                            className="relative flex items-center gap-1 px-2 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded transition-colors text-xs text-purple-400"
                            title="Review patterns"
                        >
                            <Brain className="w-3 h-3" />
                            <span>Review</span>
                            {actionBadge > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-purple-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                                    {actionBadge > 99 ? '99+' : actionBadge}
                                </span>
                            )}
                        </button>
                    )}
                    {undoStack.length > 0 && (
                        <div className="relative">
                            <button
                                onClick={() => setShowUndoHistory(!showUndoHistory)}
                                className="relative flex items-center gap-1 px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded transition-colors text-xs text-amber-400"
                                title="Undo history"
                            >
                                <Undo2 className="w-3 h-3" />
                                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                                    {undoStack.length}
                                </span>
                            </button>
                            {showUndoHistory && (
                                <div className="absolute right-0 top-full mt-1 w-72 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                                    <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Recent Actions</span>
                                        <button
                                            onClick={() => { setUndoStack([]); setShowUndoHistory(false); }}
                                            className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                    {undoStack.slice().reverse().map(entry => (
                                        <div key={entry.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors">
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                                entry.type === 'archive' ? 'bg-slate-500/20 text-slate-400' :
                                                entry.type === 'reclassify' ? 'bg-blue-500/20 text-blue-400' :
                                                'bg-amber-500/20 text-amber-400'
                                            }`}>
                                                {entry.type === 'archive' ? 'ARC' : entry.type === 'reclassify' ? 'MOV' : 'SNZ'}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <span className="text-[11px] text-slate-300 truncate block">
                                                    {entry.emailFrom.split('<')[0].trim()}
                                                </span>
                                                <span className="text-[10px] text-slate-500 truncate block">
                                                    {entry.emailSubject}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => handleUndo(entry)}
                                                className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded text-[10px] text-amber-300 font-medium transition-colors flex-shrink-0"
                                            >
                                                Undo
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {newsletterSenders.length > 0 && (
                        <button
                            onClick={() => setShowSweep(true)}
                            className="flex items-center gap-1 px-2 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded transition-colors text-xs text-purple-400"
                        >
                            <Sparkles className="w-3 h-3" />
                            <span>Cleanup</span>
                        </button>
                    )}
                    {isGoogleAuthAvailable() && (
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className="flex items-center gap-1 px-2 py-1 hover:bg-white/10 rounded transition-colors text-xs"
                        >
                            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''} ${isGoogleConnected() ? 'text-green-400' : 'text-slate-500'}`} />
                            <span className="text-slate-400">{isGoogleConnected() ? 'Sync' : 'Connect'}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto min-h-0" onClick={() => showUndoHistory && setShowUndoHistory(false)}>

            {/* Inbox Zero Progress */}
            {emails.length > 0 && (
                <div className="px-3 py-2 border-b border-white/5">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                            <Trophy className="w-3 h-3 text-yellow-400" />
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Inbox Zero</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                            {processedCount}/{emails.length}
                        </span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-emerald-500 to-yellow-500 rounded-full"
                            animate={{ width: `${inboxZeroProgress}%` }}
                            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                        />
                    </div>
                    {inboxZeroProgress >= 100 && (
                        <p className="text-[10px] text-emerald-400 mt-1 text-center font-bold">Inbox Zero achieved!</p>
                    )}
                </div>
            )}

            {/* Inline Suggestions Summary Bar */}
            {emailSuggestions.size > 0 && (
                <div className="flex items-center justify-between px-3 py-2 border-b border-purple-500/20 bg-purple-500/5 flex-shrink-0">
                    <div className="flex items-center gap-2 text-xs text-purple-400">
                        <Brain className="w-3.5 h-3.5" />
                        <span className="font-medium">
                            {emailSuggestions.size} suggestion{emailSuggestions.size !== 1 ? 's' : ''} on emails below
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={handleAcceptAllSuggestions}
                            className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 rounded text-[10px] text-purple-300 font-medium transition-colors"
                        >
                            <Check className="w-3 h-3" /> Accept All
                        </button>
                        <button
                            onClick={handleDismissAllSuggestions}
                            className="flex items-center gap-1 px-2 py-1 hover:bg-white/10 rounded text-[10px] text-slate-500 transition-colors"
                        >
                            <X className="w-3 h-3" /> Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* Pending Actions Bar (rule-based) */}
            <AnimatePresence>
                {pendingActions.length > 0 && (
                    <PendingActionsBar
                        pendingActions={pendingActions}
                        onApplyAll={handleApplyAllPending}
                        onApplyOne={handleApplyOnePending}
                        onDismissOne={handleDismissOnePending}
                        onDismissAll={handleDismissAllPending}
                        isApplying={isApplyingPending}
                    />
                )}
            </AnimatePresence>

            {/* Tier Groups */}
            <div>
                {emails.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                        <Mail className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-xs">No emails synced yet</p>
                        {isGoogleAuthAvailable() && (
                            <button onClick={handleSync} className="text-xs text-blue-400 mt-2 hover:underline">
                                Connect Gmail
                            </button>
                        )}
                    </div>
                ) : (
                    TIER_ORDER.map(tier => {
                        const tierEmails = emailsByTier.get(tier) || [];
                        if (tierEmails.length === 0) return null;
                        const config = TIER_CONFIG[tier];
                        const Icon = config.icon;
                        const isExpanded = expandedTiers.has(tier);

                        return (
                            <div key={tier} className="border-b border-white/5">
                                <button
                                    onClick={() => toggleTier(tier)}
                                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                                >
                                    {isExpanded
                                        ? <ChevronDown className="w-3 h-3 text-slate-500" />
                                        : <ChevronRight className="w-3 h-3 text-slate-500" />
                                    }
                                    <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                                    <span className={`text-xs font-bold uppercase tracking-wider ${config.color}`}>
                                        {config.label}
                                    </span>
                                    <span className={`text-[10px] px-1.5 py-0.5 ${config.bgLight} ${config.color} rounded-full font-bold`}>
                                        {tierEmails.length}
                                    </span>
                                </button>
                                <AnimatePresence>
                                    {isExpanded && tierEmails.map(email => renderEmailCard(email))}
                                </AnimatePresence>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Load More */}
            {nextPageToken && (
                <div className="px-3 py-2 border-b border-white/5">
                    <button
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-xs text-slate-400"
                    >
                        <RefreshCw className={`w-3 h-3 ${isLoadingMore ? 'animate-spin' : ''}`} />
                        {isLoadingMore ? 'Loading...' : 'Load More'}
                    </button>
                </div>
            )}

            {/* Newsletter Senders Section */}
            {newsletterSenders.length > 0 && (
                <div className="border-b border-white/5">
                    <button
                        onClick={() => setShowNewsletters(!showNewsletters)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                    >
                        {showNewsletters ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                        <Newspaper className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-purple-400">Newsletters</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full font-bold">
                            {newsletterSenders.length}
                        </span>
                    </button>
                    <AnimatePresence>
                        {showNewsletters && newsletterSenders.map(sender => {
                            const action = buildUnsubscribeAction(sender);
                            return (
                                <motion.div
                                    key={sender.address}
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="px-3"
                                >
                                    <div className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/5 transition-all">
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs font-medium text-slate-300 truncate block">{sender.displayName}</span>
                                            <span className="text-[10px] text-slate-600">
                                                {sender.emailCount} emails · Last: {new Date(sender.lastReceived).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {action && action.type === 'url' && (
                                                <a
                                                    href={action.target}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1 hover:bg-purple-500/20 rounded text-purple-400 text-[10px] flex items-center gap-0.5"
                                                    title="Unsubscribe"
                                                >
                                                    <ExternalLink className="w-3 h-3" /> Unsub
                                                </a>
                                            )}
                                            <button
                                                onClick={() => handleBulkArchive(sender.address)}
                                                className="p-1 hover:bg-white/10 rounded text-slate-400 text-[10px] flex items-center gap-0.5"
                                                title="Archive all from this sender"
                                            >
                                                <Archive className="w-3 h-3" /> All
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            {/* Snoozed Emails Section */}
            {snoozedEmails.length > 0 && (
                <div className="border-b border-white/5">
                    <button
                        onClick={() => setShowSnoozed(!showSnoozed)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                    >
                        {showSnoozed ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Snoozed</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-bold">
                            {snoozedEmails.length}
                        </span>
                    </button>
                    <AnimatePresence>
                        {showSnoozed && snoozedEmails.map(email => (
                            <motion.div
                                key={email.id}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="px-3"
                            >
                                <div className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/5 transition-all">
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs font-medium text-slate-300 truncate block">
                                            {email.from.split('<')[0].trim()} — {email.subject}
                                        </span>
                                        <span className="text-[10px] text-amber-500 flex items-center gap-1">
                                            <Bell className="w-2.5 h-2.5" />
                                            {email.snooze_until ? new Date(email.snooze_until).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Snoozed'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleUnsnooze(email)}
                                        className="p-1 hover:bg-amber-500/20 rounded text-amber-400 text-[10px] flex-shrink-0"
                                        title="Unsnooze"
                                    >
                                        Unsnooze
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            </div>{/* end scrollable content area */}

            {/* Portaled overlays — escape widget's backdrop-filter containing block */}
            {createPortal(
                <>
                    {/* Email Detail / Reply Modal */}
                    <AnimatePresence>
                        {selectedEmail && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
                                onClick={() => setSelectedEmail(null)}
                            >
                                <motion.div
                                    initial={{ scale: 0.9, y: 20 }}
                                    animate={{ scale: 1, y: 0 }}
                                    exit={{ scale: 0.9, y: 20 }}
                                    onClick={e => e.stopPropagation()}
                                    className="glass-card p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto"
                                >
                                    {/* Header */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-sm font-bold text-white truncate">{selectedEmail.subject}</h3>
                                            <p className="text-xs text-slate-500 mt-0.5">{selectedEmail.from}</p>
                                            <p className="text-[10px] text-slate-600">
                                                {new Date(selectedEmail.received_at).toLocaleString()}
                                            </p>
                                        </div>
                                        {/* Tier Reclassify */}
                                        <div className="flex gap-1 ml-2 flex-shrink-0">
                                            {TIER_ORDER.map(t => {
                                                const cfg = TIER_CONFIG[t];
                                                const TierIcon = cfg.icon;
                                                const effectiveTier = selectedEmail.tier_override || selectedEmail.tier;
                                                return (
                                                    <button
                                                        key={t}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleReclassify(selectedEmail, t);
                                                        }}
                                                        className={`p-1.5 rounded transition-colors ${effectiveTier === t ? `${cfg.bgMedium}` : 'hover:bg-white/10'}`}
                                                        title={cfg.label}
                                                    >
                                                        <TierIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    {/* Snippet */}
                                    <div className="text-xs text-slate-400 bg-white/5 rounded-lg p-3 mb-3">
                                        {selectedEmail.snippet}
                                    </div>
                                    {/* AI Draft / Reply */}
                                    <div className="space-y-2">
                                        {isClassifierAvailable() && !draftText && (
                                            <button
                                                onClick={() => handleDraftAI(selectedEmail)}
                                                disabled={isDrafting}
                                                className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-xs text-indigo-400 transition-colors w-full"
                                            >
                                                <Edit3 className={`w-3.5 h-3.5 ${isDrafting ? 'animate-pulse' : ''}`} />
                                                {isDrafting ? 'Drafting...' : 'AI Draft Response'}
                                            </button>
                                        )}

                                        {(draftText || selectedEmail.ai_draft) && (
                                            <>
                                                <label className="block text-[10px] text-slate-500 uppercase tracking-wider">
                                                    {selectedEmail.ai_draft && !draftText ? 'AI Draft' : 'Reply'}
                                                </label>
                                                <textarea
                                                    value={draftText || selectedEmail.ai_draft || ''}
                                                    onChange={e => setDraftText(e.target.value)}
                                                    rows={4}
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                                />
                                            </>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2 mt-4">
                                        <button
                                            onClick={() => setSelectedEmail(null)}
                                            className="flex-1 px-3 py-2 text-xs text-slate-500 hover:text-white transition-colors"
                                        >
                                            Close
                                        </button>
                                        {/* Snooze dropdown */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setSnoozeDropdownId(snoozeDropdownId === selectedEmail.id ? null : selectedEmail.id)}
                                                className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg text-xs text-amber-300 transition-colors flex items-center gap-1"
                                            >
                                                <Clock className="w-3 h-3" /> Snooze
                                            </button>
                                            {snoozeDropdownId === selectedEmail.id && (
                                                <div className="absolute bottom-full mb-1 left-0 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 min-w-[160px]">
                                                    {([
                                                        { preset: 'later_today' as SnoozePreset, label: 'Later Today (3h)' },
                                                        { preset: 'tomorrow_morning' as SnoozePreset, label: 'Tomorrow 9 AM' },
                                                        { preset: 'next_week' as SnoozePreset, label: 'Next Monday 9 AM' },
                                                    ]).map(opt => (
                                                        <button
                                                            key={opt.preset}
                                                            onClick={() => handleSnooze(selectedEmail, opt.preset)}
                                                            className="block w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/10 transition-colors first:rounded-t-lg last:rounded-b-lg"
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleArchive(selectedEmail)}
                                            className="px-3 py-2 bg-slate-500/20 hover:bg-slate-500/30 rounded-lg text-xs text-slate-300 transition-colors flex items-center gap-1"
                                        >
                                            <Archive className="w-3 h-3" /> Archive
                                        </button>
                                        {draftText && isGoogleConnected() && (
                                            <button
                                                onClick={() => handleSend(selectedEmail)}
                                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-xs font-bold text-white transition-all flex items-center gap-1"
                                            >
                                                <Send className="w-3 h-3" /> Send
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Unsubscribe Sweep Overlay */}
                    <AnimatePresence>
                        {showSweep && db && (
                            <UnsubscribeSweep
                                db={db}
                                senders={newsletterSenders}
                                onClose={() => {
                                    setShowSweep(false);
                                    getNewsletterSenders(db).then(setNewsletterSenders).catch(err => {
                                        console.error('[EmailDashboard] Failed to refresh newsletter senders:', err);
                                    });
                                }}
                            />
                        )}
                    </AnimatePresence>

                    {/* Toast */}
                    <AnimatePresence>
                        {toast && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="fixed bottom-6 right-6 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 flex items-center gap-2"
                            >
                                <span>{toast.message}</span>
                                {toast.action && (
                                    <button
                                        onClick={() => { toast.action!.onAction(); setToast(null); }}
                                        className="ml-2 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs font-bold transition-colors"
                                    >
                                        {toast.action.label}
                                    </button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>,
                document.body
            )}
        </div>
    );
}
