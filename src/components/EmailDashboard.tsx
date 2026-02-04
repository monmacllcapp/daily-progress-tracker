import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mail, AlertCircle, MessageSquare, Tag, Trash2,
    RefreshCw, Send, Edit3, Archive, ChevronDown, ChevronRight, Trophy,
    Clock, Bell, ExternalLink, Newspaper, Eye, HelpCircle, Users,
    CheckSquare, Square, Zap
} from 'lucide-react';
import { createDatabase } from '../db';
import { isGoogleConnected, requestGoogleAuth, isGoogleAuthAvailable } from '../services/google-auth';
import { syncGmailInbox, archiveMessage, sendReply } from '../services/gmail';
import { classifyEmail, draftResponse, isClassifierAvailable } from '../services/email-classifier';
import { scoreAllEmails } from '../services/email-scorer';
import { detectNewsletters, getNewsletterSenders, bulkArchiveBySender, buildUnsubscribeAction } from '../services/newsletter-detector';
import { snoozeEmail, unsnoozeEmail } from '../services/email-snooze';
import { applyTitanLabel, transitionLabel } from '../services/gmail-labels';
import type { NewsletterSender } from '../services/newsletter-detector';
import type { SnoozePreset } from '../services/email-snooze';
import type { Email, EmailTier, EmailStatus } from '../types/schema';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';

// Pipeline group definitions
type PipelineGroup = 'action' | 'tracking' | 'cleanup' | 'processed';

interface TierConfig {
    label: string;
    shortLabel: string;
    icon: typeof AlertCircle;
    color: string;
    bgColor: string;
    bgLight: string;
    bgMedium: string;
    borderColor: string;
    group: PipelineGroup;
    sortOrder: number;
}

const TIER_CONFIG: Record<EmailTier, TierConfig> = {
    reply_urgent:        { label: '1 REPLY-URGENT',       shortLabel: 'Reply Urgent',     icon: AlertCircle,   color: 'text-red-400',    bgColor: 'bg-red-500',    bgLight: 'bg-red-500/20',    bgMedium: 'bg-red-500/30',    borderColor: 'border-red-500',    group: 'action',    sortOrder: 1 },
    reply_needed:        { label: '1.5 TO REPLY',         shortLabel: 'To Reply',         icon: MessageSquare, color: 'text-orange-400',  bgColor: 'bg-orange-500',  bgLight: 'bg-orange-500/20',  bgMedium: 'bg-orange-500/30',  borderColor: 'border-orange-500',  group: 'action',    sortOrder: 2 },
    to_review:           { label: '2 TO REVIEW',          shortLabel: 'To Review',        icon: Eye,           color: 'text-blue-400',   bgColor: 'bg-blue-500',   bgLight: 'bg-blue-500/20',   bgMedium: 'bg-blue-500/30',   borderColor: 'border-blue-500',   group: 'action',    sortOrder: 3 },
    important_not_urgent:{ label: '2.5 NON URGENT',       shortLabel: 'Non Urgent',       icon: Tag,           color: 'text-cyan-400',   bgColor: 'bg-cyan-500',   bgLight: 'bg-cyan-500/20',   bgMedium: 'bg-cyan-500/30',   borderColor: 'border-cyan-500',   group: 'action',    sortOrder: 4 },
    unsure:              { label: '6 NOT SURE',           shortLabel: 'Not Sure',         icon: HelpCircle,    color: 'text-yellow-400', bgColor: 'bg-yellow-500', bgLight: 'bg-yellow-500/20', bgMedium: 'bg-yellow-500/30', borderColor: 'border-yellow-500', group: 'action',    sortOrder: 5 },
    unsubscribe:         { label: '7 UNSUBSCRIBE',        shortLabel: 'Unsubscribe',      icon: Trash2,        color: 'text-slate-400',  bgColor: 'bg-slate-500',  bgLight: 'bg-slate-500/20',  bgMedium: 'bg-slate-500/30',  borderColor: 'border-slate-500',  group: 'cleanup',   sortOrder: 7 },
    social:              { label: '8 SOCIAL',             shortLabel: 'Social',           icon: Users,         color: 'text-purple-400', bgColor: 'bg-purple-500', bgLight: 'bg-purple-500/20', bgMedium: 'bg-purple-500/30', borderColor: 'border-purple-500', group: 'cleanup',   sortOrder: 8 },
};

const GROUP_CONFIG: Record<PipelineGroup, { label: string; icon: typeof AlertCircle; color: string }> = {
    action:    { label: 'ACTION REQUIRED',  icon: Zap,     color: 'text-red-400' },
    tracking:  { label: 'TRACKING',         icon: Clock,   color: 'text-amber-400' },
    cleanup:   { label: 'CLEANUP',          icon: Trash2,  color: 'text-slate-400' },
    processed: { label: 'PROCESSED',        icon: Archive, color: 'text-emerald-400' },
};

const PIPELINE_TIERS: EmailTier[] = ['reply_urgent', 'reply_needed', 'to_review', 'important_not_urgent', 'unsure', 'unsubscribe', 'social'];
const ALL_TIERS: EmailTier[] = ['reply_urgent', 'reply_needed', 'to_review', 'important_not_urgent', 'unsure', 'unsubscribe', 'social'];

export function EmailDashboard() {
    const [db] = useDatabase();
    const [emails] = useRxQuery<Email>(db?.emails, { sort: [{ received_at: 'desc' }] });
    const [isSyncing, setIsSyncing] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['action', 'tracking']));
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [draftText, setDraftText] = useState('');
    const [isDrafting, setIsDrafting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [newsletterSenders, setNewsletterSenders] = useState<NewsletterSender[]>([]);
    const [showNewsletters, setShowNewsletters] = useState(false);
    const [showSnoozed, setShowSnoozed] = useState(false);
    const [snoozeDropdownId, setSnoozeDropdownId] = useState<string | null>(null);
    const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
    const [learningMode, setLearningMode] = useState(false);

    useEffect(() => {
        if (!db) return;
        getNewsletterSenders(db).then(setNewsletterSenders).catch(err => {
            console.error('[EmailDashboard] Failed to load newsletter senders:', err);
        });
    }, [db]);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2000);
    };

    // Group emails by pipeline structure
    const groupedEmails = useMemo(() => {
        const actionEmails = new Map<EmailTier, Email[]>();
        const trackingEmails: { waiting: Email[]; replied: Email[] } = { waiting: [], replied: [] };
        const cleanupEmails = new Map<EmailTier, Email[]>();
        const processedEmails: { reviewed: Email[]; archived: Email[] } = { reviewed: [], archived: [] };

        for (const tier of PIPELINE_TIERS) actionEmails.set(tier, []);
        cleanupEmails.set('unsubscribe', []);
        cleanupEmails.set('social', []);

        for (const email of emails) {
            const effectiveTier = email.tier_override || email.tier;

            // Workflow statuses override tier grouping
            if (email.status === 'waiting') { trackingEmails.waiting.push(email); continue; }
            if (email.status === 'replied') { trackingEmails.replied.push(email); continue; }
            if (email.status === 'reviewed') { processedEmails.reviewed.push(email); continue; }
            if (email.status === 'archived') { processedEmails.archived.push(email); continue; }
            if (email.status === 'snoozed') continue;

            const config = TIER_CONFIG[effectiveTier];
            if (config?.group === 'action') {
                actionEmails.get(effectiveTier)?.push(email);
            } else if (config?.group === 'cleanup') {
                cleanupEmails.get(effectiveTier)?.push(email);
            }
        }

        // Sort within each group by score
        for (const [, list] of actionEmails) list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        for (const [, list] of cleanupEmails) list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

        return { actionEmails, trackingEmails, cleanupEmails, processedEmails };
    }, [emails]);

    const actionRequiredCount = useMemo(() => {
        let count = 0;
        for (const [, list] of groupedEmails.actionEmails) count += list.length;
        return count;
    }, [groupedEmails]);

    const handleSync = async () => {
        if (!isGoogleConnected()) {
            try { await requestGoogleAuth(); } catch { return; }
        }
        setIsSyncing(true);
        try {
            const db = await createDatabase();
            const count = await syncGmailInbox(db, classifyEmail);
            await scoreAllEmails(db);
            await detectNewsletters(db);
            setNewsletterSenders(await getNewsletterSenders(db));
            showToast(count > 0 ? `Synced ${count} new emails` : 'Inbox up to date');
        } catch (err) {
            console.error('[EmailDashboard] Sync failed:', err);
            showToast('Sync failed');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleArchive = async (email: Email) => {
        try {
            if (isGoogleConnected()) await archiveMessage(email.gmail_id);
            const db = await createDatabase();
            const doc = await db.emails.findOne(email.id).exec();
            if (doc) await doc.patch({ status: 'archived', updated_at: new Date().toISOString() });
            if (isGoogleConnected()) await applyTitanLabel(email.gmail_id, 'archived').catch(() => {});
            showToast('Archived');
        } catch (err) {
            console.error('[EmailDashboard] Archive failed:', err);
        }
    };

    const handleReclassify = async (email: Email, newTier: EmailTier) => {
        const db = await createDatabase();
        const doc = await db.emails.findOne(email.id).exec();
        if (doc) {
            await doc.patch({ tier_override: newTier, updated_at: new Date().toISOString() });
            if (isGoogleConnected()) {
                const oldTier = email.tier_override || email.tier;
                await transitionLabel(email.gmail_id, oldTier, newTier).catch(() => {});
            }
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
            }
        } finally {
            setIsDrafting(false);
        }
    };

    const handleSend = async (email: Email) => {
        if (!draftText.trim()) return;
        try {
            await sendReply(email.thread_id || email.gmail_id, email.from, `Re: ${email.subject}`, draftText);
            const db = await createDatabase();
            const doc = await db.emails.findOne(email.id).exec();
            if (doc) await doc.patch({ status: 'replied', updated_at: new Date().toISOString() });
            if (isGoogleConnected()) await applyTitanLabel(email.gmail_id, 'replied').catch(() => {});
            setSelectedEmail(null);
            setDraftText('');
            showToast('Reply sent');
        } catch (err) {
            console.error('[EmailDashboard] Send failed:', err);
            showToast('Failed to send');
        }
    };

    const handleTrackResponse = async (email: Email) => {
        try {
            const db = await createDatabase();
            const doc = await db.emails.findOne(email.id).exec();
            if (doc) await doc.patch({ status: 'waiting', updated_at: new Date().toISOString() });
            if (isGoogleConnected()) await applyTitanLabel(email.gmail_id, 'waiting').catch(() => {});
            setSelectedEmail(null);
            showToast('Tracking response');
        } catch (err) {
            console.error('[EmailDashboard] Track failed:', err);
        }
    };

    const handleMarkReviewed = async (email: Email) => {
        try {
            const db = await createDatabase();
            const doc = await db.emails.findOne(email.id).exec();
            if (doc) await doc.patch({ status: 'reviewed', updated_at: new Date().toISOString() });
            if (isGoogleConnected()) await applyTitanLabel(email.gmail_id, 'reviewed').catch(() => {});
            showToast('Marked reviewed');
        } catch (err) {
            console.error('[EmailDashboard] Review failed:', err);
        }
    };

    const handleSnooze = async (email: Email, preset: SnoozePreset) => {
        try {
            const db = await createDatabase();
            await snoozeEmail(db, email.id, preset);
            setSnoozeDropdownId(null);
            setSelectedEmail(null);
            showToast('Email snoozed');
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

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group);
            else next.add(group);
            return next;
        });
    };

    const toggleSelect = (emailId: string) => {
        setSelectedEmails(prev => {
            const next = new Set(prev);
            if (next.has(emailId)) next.delete(emailId);
            else next.add(emailId);
            return next;
        });
    };

    const bulkClassify = async (tier: EmailTier) => {
        const db = await createDatabase();
        for (const emailId of selectedEmails) {
            const doc = await db.emails.findOne(emailId).exec();
            if (doc) {
                await doc.patch({ tier_override: tier, updated_at: new Date().toISOString() });
                const email = doc.toJSON() as Email;
                if (isGoogleConnected()) {
                    await transitionLabel(email.gmail_id, email.tier_override || email.tier, tier).catch(() => {});
                }
            }
        }
        setSelectedEmails(new Set());
        showToast(`Reclassified ${selectedEmails.size} emails`);
    };

    const bulkArchiveSelected = async () => {
        const db = await createDatabase();
        let count = 0;
        for (const emailId of selectedEmails) {
            const doc = await db.emails.findOne(emailId).exec();
            if (doc) {
                const email = doc.toJSON() as Email;
                if (isGoogleConnected()) await archiveMessage(email.gmail_id).catch(() => {});
                await doc.patch({ status: 'archived', updated_at: new Date().toISOString() });
                count++;
            }
        }
        setSelectedEmails(new Set());
        showToast(`Archived ${count} emails`);
    };

    // Snoozed emails
    const snoozedEmails = emails.filter(e => e.status === 'snoozed');

    const totalActive = emails.filter(e => !['archived', 'replied', 'reviewed', 'snoozed'].includes(e.status)).length;
    const processedCount = emails.filter(e => ['archived', 'replied', 'reviewed'].includes(e.status)).length;
    const inboxZeroProgress = emails.length > 0 ? (processedCount / emails.length) * 100 : 0;

    const renderEmailCard = (email: Email) => {
        const effectiveTier = email.tier_override || email.tier;
        const config = TIER_CONFIG[effectiveTier];
        const isSelected = selectedEmails.has(email.id);
        const hasDraft = !!email.ai_draft;

        return (
            <motion.div
                key={email.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-3"
            >
                <div
                    className={`flex items-start gap-2 py-2 px-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer group ${
                        effectiveTier === 'reply_urgent' ? 'border-l-2 border-red-500' :
                        email.status === 'unread' ? 'border-l-2 border-blue-400' : 'border-l-2 border-transparent'
                    }`}
                    onClick={() => {
                        setSelectedEmail(email);
                        setDraftText(email.ai_draft || '');
                    }}
                >
                    {/* Checkbox */}
                    <button
                        onClick={e => { e.stopPropagation(); toggleSelect(email.id); }}
                        className="mt-0.5 flex-shrink-0"
                    >
                        {isSelected
                            ? <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                            : <Square className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400" />
                        }
                    </button>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium truncate ${email.status === 'unread' ? 'text-white' : 'text-slate-400'}`}>
                                {email.from.split('<')[0].trim()}
                            </span>
                            {hasDraft && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded font-bold">
                                    Draft Ready
                                </span>
                            )}
                            {email.score != null && (
                                <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                                    email.score >= 70 ? 'bg-red-500/20 text-red-400' :
                                    email.score >= 40 ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                }`}>{email.score}</span>
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

                    {/* Quick Actions */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {hasDraft && (
                            <button
                                onClick={e => { e.stopPropagation(); setSelectedEmail(email); setDraftText(email.ai_draft || ''); }}
                                className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400"
                                title="Review Draft"
                            >
                                <Edit3 className="w-3 h-3" />
                            </button>
                        )}
                        <button
                            onClick={e => { e.stopPropagation(); handleArchive(email); }}
                            className="p-1 hover:bg-white/10 rounded"
                            title="Archive"
                        >
                            <Archive className="w-3 h-3 text-slate-400" />
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    };

    const renderTierSection = (tier: EmailTier, tierEmails: Email[]) => {
        if (tierEmails.length === 0) return null;
        const config = TIER_CONFIG[tier];
        const Icon = config.icon;

        return (
            <div key={tier} className="ml-2">
                <div className="flex items-center gap-2 px-3 py-1">
                    <Icon className={`w-3 h-3 ${config.color}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
                        {config.shortLabel}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 ${config.bgLight} ${config.color} rounded-full font-bold`}>
                        {tierEmails.length}
                    </span>
                </div>
                <AnimatePresence>
                    {tierEmails.map(renderEmailCard)}
                </AnimatePresence>
            </div>
        );
    };

    return (
        <div className="flex flex-col text-white">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-bold">Email Pipeline</span>
                    {actionRequiredCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] font-bold rounded-full">
                            {actionRequiredCount} action
                        </span>
                    )}
                    {learningMode && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                            Learning
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setLearningMode(!learningMode)}
                        className={`p-1 rounded transition-colors ${learningMode ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-400'}`}
                        title={learningMode ? 'Disable Learning Mode' : 'Enable Learning Mode'}
                    >
                        <Zap className="w-3 h-3" />
                    </button>
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

            {/* Pipeline Progress */}
            {emails.length > 0 && (
                <div className="px-3 py-2 border-b border-white/5">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                            <Trophy className="w-3 h-3 text-yellow-400" />
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Pipeline Zero</span>
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
                        <p className="text-[10px] text-emerald-400 mt-1 text-center font-bold">Pipeline Zero achieved!</p>
                    )}
                </div>
            )}

            {/* Pipeline Groups */}
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
                    <>
                        {/* ACTION REQUIRED */}
                        {actionRequiredCount > 0 && (
                            <div className="border-b border-white/5">
                                <button
                                    onClick={() => toggleGroup('action')}
                                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                                >
                                    {expandedGroups.has('action') ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                                    <Zap className="w-3.5 h-3.5 text-red-400" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-red-400">Action Required</span>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full font-bold">
                                        {actionRequiredCount}
                                    </span>
                                </button>
                                {expandedGroups.has('action') && (
                                    <div className="pb-2">
                                        {PIPELINE_TIERS.filter(t => TIER_CONFIG[t].group === 'action').map(tier =>
                                            renderTierSection(tier, groupedEmails.actionEmails.get(tier) || [])
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TRACKING */}
                        {(groupedEmails.trackingEmails.waiting.length > 0 || groupedEmails.trackingEmails.replied.length > 0) && (
                            <div className="border-b border-white/5">
                                <button
                                    onClick={() => toggleGroup('tracking')}
                                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                                >
                                    {expandedGroups.has('tracking') ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Tracking</span>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-bold">
                                        {groupedEmails.trackingEmails.waiting.length + groupedEmails.trackingEmails.replied.length}
                                    </span>
                                </button>
                                {expandedGroups.has('tracking') && (
                                    <div className="pb-2">
                                        {groupedEmails.trackingEmails.waiting.length > 0 && (
                                            <div className="ml-2">
                                                <div className="flex items-center gap-2 px-3 py-1">
                                                    <Clock className="w-3 h-3 text-amber-400" />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Waiting</span>
                                                    <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-bold">
                                                        {groupedEmails.trackingEmails.waiting.length}
                                                    </span>
                                                </div>
                                                <AnimatePresence>
                                                    {groupedEmails.trackingEmails.waiting.map(renderEmailCard)}
                                                </AnimatePresence>
                                            </div>
                                        )}
                                        {groupedEmails.trackingEmails.replied.length > 0 && (
                                            <div className="ml-2">
                                                <div className="flex items-center gap-2 px-3 py-1">
                                                    <Send className="w-3 h-3 text-emerald-400" />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Replied</span>
                                                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold">
                                                        {groupedEmails.trackingEmails.replied.length}
                                                    </span>
                                                </div>
                                                <AnimatePresence>
                                                    {groupedEmails.trackingEmails.replied.map(renderEmailCard)}
                                                </AnimatePresence>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* CLEANUP */}
                        {(groupedEmails.cleanupEmails.get('unsubscribe')?.length || 0) + (groupedEmails.cleanupEmails.get('social')?.length || 0) > 0 && (
                            <div className="border-b border-white/5">
                                <button
                                    onClick={() => toggleGroup('cleanup')}
                                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                                >
                                    {expandedGroups.has('cleanup') ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Cleanup</span>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-500/20 text-slate-400 rounded-full font-bold">
                                        {(groupedEmails.cleanupEmails.get('unsubscribe')?.length || 0) + (groupedEmails.cleanupEmails.get('social')?.length || 0)}
                                    </span>
                                </button>
                                {expandedGroups.has('cleanup') && (
                                    <div className="pb-2">
                                        {renderTierSection('unsubscribe', groupedEmails.cleanupEmails.get('unsubscribe') || [])}
                                        {renderTierSection('social', groupedEmails.cleanupEmails.get('social') || [])}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* PROCESSED */}
                        {(groupedEmails.processedEmails.reviewed.length > 0 || groupedEmails.processedEmails.archived.length > 0) && (
                            <div className="border-b border-white/5">
                                <button
                                    onClick={() => toggleGroup('processed')}
                                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                                >
                                    {expandedGroups.has('processed') ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                                    <Archive className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Processed</span>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold">
                                        {groupedEmails.processedEmails.reviewed.length + groupedEmails.processedEmails.archived.length}
                                    </span>
                                </button>
                                {expandedGroups.has('processed') && (
                                    <div className="pb-2">
                                        {groupedEmails.processedEmails.reviewed.length > 0 && (
                                            <div className="ml-2">
                                                <div className="flex items-center gap-2 px-3 py-1">
                                                    <Eye className="w-3 h-3 text-emerald-400" />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Reviewed</span>
                                                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold">
                                                        {groupedEmails.processedEmails.reviewed.length}
                                                    </span>
                                                </div>
                                                <AnimatePresence>
                                                    {groupedEmails.processedEmails.reviewed.map(renderEmailCard)}
                                                </AnimatePresence>
                                            </div>
                                        )}
                                        {groupedEmails.processedEmails.archived.length > 0 && (
                                            <div className="ml-2">
                                                <div className="flex items-center gap-2 px-3 py-1">
                                                    <Archive className="w-3 h-3 text-slate-400" />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Archived</span>
                                                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-500/20 text-slate-400 rounded-full font-bold">
                                                        {groupedEmails.processedEmails.archived.length}
                                                    </span>
                                                </div>
                                                <AnimatePresence>
                                                    {groupedEmails.processedEmails.archived.map(renderEmailCard)}
                                                </AnimatePresence>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

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
                                <div className="flex gap-1 ml-2 flex-shrink-0 flex-wrap max-w-[200px]">
                                    {ALL_TIERS.map(t => {
                                        const cfg = TIER_CONFIG[t];
                                        const TierIcon = cfg.icon;
                                        const effectiveTier = selectedEmail.tier_override || selectedEmail.tier;
                                        return (
                                            <button
                                                key={t}
                                                onClick={() => handleReclassify(selectedEmail, t)}
                                                className={`p-1 rounded transition-colors ${effectiveTier === t ? cfg.bgMedium : 'hover:bg-white/10'}`}
                                                title={cfg.shortLabel}
                                            >
                                                <TierIcon className={`w-3 h-3 ${cfg.color}`} />
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
                            <div className="flex gap-2 mt-4 flex-wrap">
                                <button
                                    onClick={() => setSelectedEmail(null)}
                                    className="px-3 py-2 text-xs text-slate-500 hover:text-white transition-colors"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={() => handleMarkReviewed(selectedEmail)}
                                    className="px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-lg text-xs text-emerald-300 transition-colors flex items-center gap-1"
                                >
                                    <Eye className="w-3 h-3" /> Reviewed
                                </button>
                                <button
                                    onClick={() => handleTrackResponse(selectedEmail)}
                                    className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg text-xs text-amber-300 transition-colors flex items-center gap-1"
                                >
                                    <Clock className="w-3 h-3" /> Track
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

            {/* Bulk Action Bar */}
            <AnimatePresence>
                {selectedEmails.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 border border-white/10 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 z-50"
                    >
                        <span className="text-xs text-slate-400 font-medium">{selectedEmails.size} selected</span>
                        <div className="h-4 w-px bg-white/10" />
                        <select
                            onChange={e => { if (e.target.value) bulkClassify(e.target.value as EmailTier); e.target.value = ''; }}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
                            defaultValue=""
                        >
                            <option value="" disabled>Classify as...</option>
                            {ALL_TIERS.map(t => <option key={t} value={t}>{TIER_CONFIG[t].shortLabel}</option>)}
                        </select>
                        <button
                            onClick={bulkArchiveSelected}
                            className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-xs text-white transition-colors flex items-center gap-1"
                        >
                            <Archive className="w-3 h-3" /> Archive
                        </button>
                        <button
                            onClick={() => setSelectedEmails(new Set())}
                            className="px-2 py-1.5 text-xs text-slate-500 hover:text-white transition-colors"
                        >
                            Clear
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-6 right-6 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50"
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
