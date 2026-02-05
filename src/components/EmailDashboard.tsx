import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mail, AlertCircle, MessageSquare, Tag, Trash2,
    RefreshCw, Send, Edit3, Archive, ChevronDown, ChevronRight, Trophy,
    Clock, Bell, ExternalLink, Newspaper, Eye, HelpCircle, Users,
    CheckSquare, Square, Zap, Save, FolderOpen, Palette, X
} from 'lucide-react';
import { createDatabase } from '../db';
import { isGoogleConnected, requestGoogleAuth, isGoogleAuthAvailable } from '../services/google-auth';
import { syncGmailInbox, archiveMessage, sendReply, resyncGmailLabels, getMessageBody } from '../services/gmail';
import { classifyEmail, draftResponse, isClassifierAvailable } from '../services/email-classifier';
import { scoreAllEmails } from '../services/email-scorer';
import { detectNewsletters, getNewsletterSenders, bulkArchiveBySender, buildUnsubscribeAction, buildUnsubscribeStrategy } from '../services/newsletter-detector';
import { snoozeEmail, unsnoozeEmail } from '../services/email-snooze';
import { applyTitanLabel, transitionLabel } from '../services/gmail-labels';
import { unsubscribeAndTrack } from '../services/unsubscribe-agent';
import {
    listPresets, savePreset, savePresetAs, deletePreset,
    getActivePresetId, setActivePresetId, clearActivePreset, getPreset,
    COLOR_PALETTES, PALETTE_NAMES,
} from '../services/layout-presets';
import type { LayoutPreset, LayoutPresetConfig, TierColorOverride } from '../services/layout-presets';
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

const DEFAULT_TIER_CONFIG: Record<EmailTier, TierConfig> = {
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

/** Sanitize email HTML: keep links/images/formatting, remove scripts/styles/events. */
function sanitizeEmailHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Remove dangerous and layout-breaking elements
    doc.querySelectorAll('script, noscript, iframe, object, embed, form, input, textarea, button, meta, link, style').forEach(el => el.remove());
    doc.querySelectorAll('*').forEach(el => {
        // Strip event handlers and javascript: URLs
        Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
            if (attr.name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:')) el.removeAttribute(attr.name);
        });
        // Strip inline styles (they force white backgrounds / black text)
        (el as HTMLElement).removeAttribute('style');
    });
    // Make links open in new tab
    doc.querySelectorAll('a[href]').forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
    });
    return doc.body.innerHTML;
}
const ALL_TIERS: EmailTier[] = ['reply_urgent', 'reply_needed', 'to_review', 'important_not_urgent', 'unsure', 'unsubscribe', 'social'];

export function EmailDashboard() {
    const [db] = useDatabase();
    const [emails] = useRxQuery<Email>(db?.emails, { sort: [{ received_at: 'desc' }] });
    const [isSyncing, setIsSyncing] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['action', 'tracking']));
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [emailBody, setEmailBody] = useState<{ html: string | null; text: string | null } | null>(null);
    const [isLoadingBody, setIsLoadingBody] = useState(false);
    const [draftText, setDraftText] = useState('');
    const [isDrafting, setIsDrafting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [newsletterSenders, setNewsletterSenders] = useState<NewsletterSender[]>([]);
    const [showNewsletters, setShowNewsletters] = useState(false);
    const [showSnoozed, setShowSnoozed] = useState(false);
    const [snoozeDropdownId, setSnoozeDropdownId] = useState<string | null>(null);
    const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
    const [learningMode, setLearningMode] = useState(true);
    const [unsubscribingAddresses, setUnsubscribingAddresses] = useState<Set<string>>(new Set());
    const [tierColorOverrides, setTierColorOverrides] = useState<Partial<Record<EmailTier, TierColorOverride>>>({});
    const [activePresetName, setActivePresetName] = useState<string | null>(null);
    const [presetMenuOpen, setPresetMenuOpen] = useState(false);
    const [presetNameInput, setPresetNameInput] = useState('');
    const [showSaveAsInput, setShowSaveAsInput] = useState(false);
    const [showColorEditor, setShowColorEditor] = useState(false);

    // Merge default tier config with color overrides
    const TIER_CONFIG = useMemo(() => {
        const merged = { ...DEFAULT_TIER_CONFIG };
        for (const [tier, override] of Object.entries(tierColorOverrides)) {
            const t = tier as EmailTier;
            if (merged[t] && override) {
                merged[t] = { ...merged[t], ...override };
            }
        }
        return merged;
    }, [tierColorOverrides]);

    // Load active preset on mount
    useEffect(() => {
        const activeId = getActivePresetId();
        if (activeId) {
            const preset = getPreset(activeId);
            if (preset) {
                applyPresetConfig(preset.config);
                setActivePresetName(preset.name);
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const buildCurrentConfig = useCallback((): LayoutPresetConfig => ({
        expandedGroups: Array.from(expandedGroups),
        learningMode,
        showNewsletters,
        showSnoozed,
        tierColors: tierColorOverrides,
    }), [expandedGroups, learningMode, showNewsletters, showSnoozed, tierColorOverrides]);

    const applyPresetConfig = (config: LayoutPresetConfig) => {
        setExpandedGroups(new Set(config.expandedGroups));
        setLearningMode(config.learningMode);
        setShowNewsletters(config.showNewsletters);
        setShowSnoozed(config.showSnoozed);
        setTierColorOverrides(config.tierColors || {});
    };

    const handlePresetLoad = (preset: LayoutPreset) => {
        applyPresetConfig(preset.config);
        setActivePresetId(preset.id);
        setActivePresetName(preset.name);
        setPresetMenuOpen(false);
        showToast(`Loaded preset: ${preset.name}`);
    };

    const handlePresetSave = () => {
        if (!activePresetName) {
            setShowSaveAsInput(true);
            return;
        }
        const preset = savePreset(activePresetName, buildCurrentConfig());
        setActivePresetId(preset.id);
        setPresetMenuOpen(false);
        showToast(`Saved preset: ${activePresetName}`);
    };

    const handlePresetSaveAs = () => {
        const name = presetNameInput.trim();
        if (!name) return;
        const preset = savePresetAs(name, buildCurrentConfig());
        setActivePresetId(preset.id);
        setActivePresetName(name);
        setPresetNameInput('');
        setShowSaveAsInput(false);
        setPresetMenuOpen(false);
        showToast(`Saved preset: ${name}`);
    };

    const handlePresetDelete = (preset: LayoutPreset) => {
        deletePreset(preset.id);
        if (activePresetName === preset.name) {
            setActivePresetName(null);
            clearActivePreset();
        }
        showToast(`Deleted preset: ${preset.name}`);
    };

    const handlePresetReset = () => {
        setTierColorOverrides({});
        setActivePresetName(null);
        clearActivePreset();
        setPresetMenuOpen(false);
        showToast('Reset to defaults');
    };

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

    const openEmail = (email: Email) => {
        setSelectedEmail(email);
        setDraftText(email.ai_draft || '');
        setEmailBody(null);
        setIsLoadingBody(true);
        if (email.gmail_id && isGoogleConnected()) {
            getMessageBody(email.gmail_id)
                .then(body => setEmailBody(body))
                .catch(err => {
                    console.error('[EmailDashboard] Failed to load email body:', err);
                    setEmailBody(null);
                })
                .finally(() => setIsLoadingBody(false));
        } else {
            setIsLoadingBody(false);
        }
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
    }, [emails, TIER_CONFIG]);

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
            const labelUpdates = await resyncGmailLabels(db);
            await scoreAllEmails(db);
            await detectNewsletters(db);
            setNewsletterSenders(await getNewsletterSenders(db));
            const parts: string[] = [];
            if (count > 0) parts.push(`${count} new`);
            if (labelUpdates > 0) parts.push(`${labelUpdates} reclassified from Gmail`);
            showToast(parts.length > 0 ? `Synced: ${parts.join(', ')}` : 'Inbox up to date');
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

    const handleAutoUnsubscribe = async (sender: NewsletterSender) => {
        setUnsubscribingAddresses(prev => new Set(prev).add(sender.address));
        try {
            const database = await createDatabase();
            const result = await unsubscribeAndTrack(database, sender.address, { sender });
            setNewsletterSenders(await getNewsletterSenders(database));
            if (result.success) {
                showToast(`Unsubscribed (${result.method}): ${result.message}`);
            } else {
                showToast(`Unsubscribe failed: ${result.message}`);
            }
        } catch (err) {
            console.error('[EmailDashboard] Auto-unsubscribe failed:', err);
            showToast('Unsubscribe failed');
        } finally {
            setUnsubscribingAddresses(prev => {
                const next = new Set(prev);
                next.delete(sender.address);
                return next;
            });
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
                    onClick={() => openEmail(email)}
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
                            <span className={`text-sm font-medium truncate ${email.status === 'unread' ? 'text-white' : 'text-slate-400'}`}>
                                {email.from.split('<')[0].trim()}
                            </span>
                            {hasDraft && (
                                <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded font-bold">
                                    Draft Ready
                                </span>
                            )}
                            {email.score != null && (
                                <span className={`text-xs px-1 py-0.5 rounded font-bold ${
                                    email.score >= 70 ? 'bg-red-500/20 text-red-400' :
                                    email.score >= 40 ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                }`}>{email.score}</span>
                            )}
                            <span className="text-xs text-slate-600">
                                {new Date(email.received_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                        <p className={`text-sm truncate mt-0.5 ${email.status === 'unread' ? 'text-slate-300' : 'text-slate-500'}`}>
                            {email.subject}
                        </p>
                        <p className="text-xs text-slate-600 truncate">{email.snippet}</p>
                    </div>

                    {/* Inline Tier Icons + Quick Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 self-center">
                        {ALL_TIERS.map(t => {
                            const cfg = TIER_CONFIG[t];
                            const TierIcon = cfg.icon;
                            const isCurrent = effectiveTier === t;
                            return (
                                <button
                                    key={t}
                                    onClick={e => { e.stopPropagation(); handleReclassify(email, t); }}
                                    className={`p-1.5 rounded transition-colors ${isCurrent ? cfg.bgMedium : 'hover:bg-white/10'}`}
                                    title={cfg.shortLabel}
                                >
                                    <TierIcon className={`w-4 h-4 ${isCurrent ? cfg.color : 'text-slate-600'}`} />
                                </button>
                            );
                        })}
                        <div className="w-px h-5 bg-white/10 mx-1" />
                        {hasDraft && (
                            <button
                                onClick={e => { e.stopPropagation(); openEmail(email); }}
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
                    <span className={`text-sm font-bold uppercase tracking-wider ${config.color}`}>
                        {config.shortLabel}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 ${config.bgLight} ${config.color} rounded-full font-bold`}>
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
                    <span className="text-base font-bold">Email Pipeline</span>
                    {actionRequiredCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs font-bold rounded-full">
                            {actionRequiredCount} action
                        </span>
                    )}
                    {learningMode && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full">
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
                    {/* Preset Menu */}
                    <div className="relative">
                        <button
                            onClick={() => { setPresetMenuOpen(!presetMenuOpen); setShowColorEditor(false); }}
                            className={`p-1 rounded transition-colors ${presetMenuOpen ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:text-slate-400'}`}
                            title="Layout Presets"
                        >
                            <Palette className="w-3 h-3" />
                        </button>
                        {presetMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-50 min-w-[240px]">
                                {/* Active preset indicator */}
                                <div className="px-3 py-2 border-b border-white/10">
                                    <span className="text-xs text-slate-500 uppercase tracking-wider">
                                        {activePresetName ? `Preset: ${activePresetName}` : 'No preset active'}
                                    </span>
                                </div>

                                {/* Actions */}
                                <div className="p-1">
                                    <button
                                        onClick={handlePresetSave}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 rounded-lg transition-colors"
                                    >
                                        <Save className="w-3.5 h-3.5" /> Save{activePresetName ? '' : ' As...'}
                                    </button>
                                    <button
                                        onClick={() => setShowSaveAsInput(true)}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 rounded-lg transition-colors"
                                    >
                                        <Save className="w-3.5 h-3.5" /> Save As...
                                    </button>
                                    <button
                                        onClick={() => setShowColorEditor(!showColorEditor)}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 rounded-lg transition-colors"
                                    >
                                        <Palette className="w-3.5 h-3.5" /> Edit Colors
                                    </button>
                                    <button
                                        onClick={handlePresetReset}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-500 hover:bg-white/10 rounded-lg transition-colors"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" /> Reset to Defaults
                                    </button>
                                </div>

                                {/* Save As input */}
                                {showSaveAsInput && (
                                    <div className="px-3 py-2 border-t border-white/10">
                                        <div className="flex gap-1">
                                            <input
                                                type="text"
                                                value={presetNameInput}
                                                onChange={e => setPresetNameInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handlePresetSaveAs(); }}
                                                placeholder="Preset name..."
                                                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
                                                autoFocus
                                            />
                                            <button
                                                onClick={handlePresetSaveAs}
                                                className="px-2 py-1 bg-indigo-500 hover:bg-indigo-600 rounded text-xs text-white font-bold"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Saved presets list */}
                                {listPresets().length > 0 && (
                                    <div className="border-t border-white/10 p-1">
                                        <div className="px-3 py-1">
                                            <span className="text-xs text-slate-500 uppercase tracking-wider">Saved Presets</span>
                                        </div>
                                        {listPresets().map(p => (
                                            <div key={p.id} className="flex items-center gap-1 px-1">
                                                <button
                                                    onClick={() => handlePresetLoad(p)}
                                                    className={`flex-1 flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg transition-colors ${
                                                        activePresetName === p.name ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-300 hover:bg-white/10'
                                                    }`}
                                                >
                                                    <FolderOpen className="w-3.5 h-3.5" /> {p.name}
                                                </button>
                                                <button
                                                    onClick={() => handlePresetDelete(p)}
                                                    className="p-1 hover:bg-red-500/20 rounded text-slate-600 hover:text-red-400 transition-colors"
                                                    title="Delete preset"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Color Editor */}
                                {showColorEditor && (
                                    <div className="border-t border-white/10 p-3 max-h-[300px] overflow-y-auto">
                                        <span className="text-xs text-slate-500 uppercase tracking-wider block mb-2">Tier Colors</span>
                                        {ALL_TIERS.map(tier => {
                                            const cfg = TIER_CONFIG[tier];
                                            const TIcon = cfg.icon;
                                            return (
                                                <div key={tier} className="flex items-center gap-2 mb-2">
                                                    <TIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
                                                    <span className="text-xs text-slate-400 w-20 truncate">{cfg.shortLabel}</span>
                                                    <div className="flex gap-0.5 flex-wrap flex-1">
                                                        {PALETTE_NAMES.map(name => {
                                                            const pal = COLOR_PALETTES[name];
                                                            const isActive = cfg.color === pal.color;
                                                            return (
                                                                <button
                                                                    key={name}
                                                                    onClick={() => setTierColorOverrides(prev => ({ ...prev, [tier]: pal }))}
                                                                    className={`w-4 h-4 rounded-full ${pal.bgColor} ${isActive ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800' : 'hover:ring-1 hover:ring-white/50'} transition-all`}
                                                                    title={name}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {isGoogleAuthAvailable() && (
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className="flex items-center gap-1 px-2 py-1 hover:bg-white/10 rounded transition-colors text-sm"
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
                            <span className="text-xs text-slate-500 uppercase tracking-wider">Pipeline Zero</span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">
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
                        <p className="text-xs text-emerald-400 mt-1 text-center font-bold">Pipeline Zero achieved!</p>
                    )}
                </div>
            )}

            {/* Pipeline Groups */}
            <div>
                {emails.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                        <Mail className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm">No emails synced yet</p>
                        {isGoogleAuthAvailable() && (
                            <button onClick={handleSync} className="text-sm text-blue-400 mt-2 hover:underline">
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
                                    <span className="text-sm font-bold uppercase tracking-wider text-red-400">Action Required</span>
                                    <span className="text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full font-bold">
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
                                    <span className="text-sm font-bold uppercase tracking-wider text-amber-400">Tracking</span>
                                    <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-bold">
                                        {groupedEmails.trackingEmails.waiting.length + groupedEmails.trackingEmails.replied.length}
                                    </span>
                                </button>
                                {expandedGroups.has('tracking') && (
                                    <div className="pb-2">
                                        {groupedEmails.trackingEmails.waiting.length > 0 && (
                                            <div className="ml-2">
                                                <div className="flex items-center gap-2 px-3 py-1">
                                                    <Clock className="w-3 h-3 text-amber-400" />
                                                    <span className="text-sm font-bold uppercase tracking-wider text-amber-400">Waiting</span>
                                                    <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-bold">
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
                                                    <span className="text-sm font-bold uppercase tracking-wider text-emerald-400">Replied</span>
                                                    <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold">
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
                                    <span className="text-sm font-bold uppercase tracking-wider text-slate-400">Cleanup</span>
                                    <span className="text-xs px-1.5 py-0.5 bg-slate-500/20 text-slate-400 rounded-full font-bold">
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
                                    <span className="text-sm font-bold uppercase tracking-wider text-emerald-400">Processed</span>
                                    <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold">
                                        {groupedEmails.processedEmails.reviewed.length + groupedEmails.processedEmails.archived.length}
                                    </span>
                                </button>
                                {expandedGroups.has('processed') && (
                                    <div className="pb-2">
                                        {groupedEmails.processedEmails.reviewed.length > 0 && (
                                            <div className="ml-2">
                                                <div className="flex items-center gap-2 px-3 py-1">
                                                    <Eye className="w-3 h-3 text-emerald-400" />
                                                    <span className="text-sm font-bold uppercase tracking-wider text-emerald-400">Reviewed</span>
                                                    <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold">
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
                                                    <span className="text-sm font-bold uppercase tracking-wider text-slate-400">Archived</span>
                                                    <span className="text-xs px-1.5 py-0.5 bg-slate-500/20 text-slate-400 rounded-full font-bold">
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
                        <span className="text-sm font-bold uppercase tracking-wider text-purple-400">Newsletters</span>
                        <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full font-bold">
                            {newsletterSenders.length}
                        </span>
                    </button>
                    <AnimatePresence>
                        {showNewsletters && newsletterSenders.map(sender => {
                            const action = buildUnsubscribeAction(sender);
                            const strategies = buildUnsubscribeStrategy(sender);
                            const isUnsubscribing = unsubscribingAddresses.has(sender.address);
                            const status = sender.unsubscribeStatus;
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
                                            <span className="text-sm font-medium text-slate-300 truncate block">{sender.displayName}</span>
                                            <span className="text-xs text-slate-600">
                                                {sender.emailCount} emails · Last: {new Date(sender.lastReceived).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                {sender.hasOneClick && <span className="ml-1 text-emerald-500" title="RFC 8058 One-Click supported">1-click</span>}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {/* Status indicator */}
                                            {isUnsubscribing && (
                                                <span className="text-xs text-amber-400 flex items-center gap-0.5">
                                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                                </span>
                                            )}
                                            {!isUnsubscribing && status === 'confirmed' && (
                                                <span className="text-xs text-emerald-400 flex items-center gap-0.5" title="Unsubscribed">
                                                    <CheckSquare className="w-3 h-3" />
                                                </span>
                                            )}
                                            {!isUnsubscribing && status === 'attempted' && (
                                                <span className="text-xs text-amber-400 flex items-center gap-0.5" title="Unsubscribe attempted">
                                                    <Clock className="w-3 h-3" />
                                                </span>
                                            )}
                                            {!isUnsubscribing && status === 'failed' && (
                                                <span className="text-xs text-red-400 flex items-center gap-0.5" title="Unsubscribe failed">
                                                    <AlertCircle className="w-3 h-3" />
                                                </span>
                                            )}
                                            {/* Auto unsubscribe button */}
                                            {strategies.length > 0 && !isUnsubscribing && status !== 'confirmed' && (
                                                <button
                                                    onClick={() => handleAutoUnsubscribe(sender)}
                                                    className="p-1 hover:bg-red-500/20 rounded text-red-400 text-xs flex items-center gap-0.5"
                                                    title={`Auto unsubscribe (${strategies[0].method})`}
                                                >
                                                    <Zap className="w-3 h-3" /> Unsub
                                                </button>
                                            )}
                                            {/* Manual fallback link */}
                                            {action && action.type === 'url' && (
                                                <a
                                                    href={action.target}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1 hover:bg-purple-500/20 rounded text-purple-400 text-xs flex items-center gap-0.5"
                                                    title="Open unsubscribe page manually"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            )}
                                            <button
                                                onClick={() => handleBulkArchive(sender.address)}
                                                className="p-1 hover:bg-white/10 rounded text-slate-400 text-xs flex items-center gap-0.5"
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
                        <span className="text-sm font-bold uppercase tracking-wider text-amber-400">Snoozed</span>
                        <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-bold">
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
                                        <span className="text-sm font-medium text-slate-300 truncate block">
                                            {email.from.split('<')[0].trim()} — {email.subject}
                                        </span>
                                        <span className="text-xs text-amber-500 flex items-center gap-1">
                                            <Bell className="w-2.5 h-2.5" />
                                            {email.snooze_until ? new Date(email.snooze_until).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Snoozed'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleUnsnooze(email)}
                                        className="p-1 hover:bg-amber-500/20 rounded text-amber-400 text-xs flex-shrink-0"
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

            {/* Portalled overlays — rendered at document.body to escape WidgetWrapper's
                backdrop-filter containing block and overflow-hidden clipping */}
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
                                onClick={() => { setSelectedEmail(null); setEmailBody(null); }}
                            >
                                <motion.div
                                    initial={{ scale: 0.9, y: 20 }}
                                    animate={{ scale: 1, y: 0 }}
                                    exit={{ scale: 0.9, y: 20 }}
                                    onClick={e => e.stopPropagation()}
                                    className="glass-card p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
                                >
                                    {/* Header */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-base font-bold text-white truncate">{selectedEmail.subject}</h3>
                                            <p className="text-sm text-slate-500 mt-0.5">{selectedEmail.from}</p>
                                            <p className="text-xs text-slate-600">
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

                                    {/* Email Body */}
                                    <div className="bg-white/5 rounded-lg mb-3 max-w-2xl overflow-hidden max-h-[50vh] overflow-y-auto scrollbar-thin">
                                        {isLoadingBody ? (
                                            <div className="flex items-center gap-2 p-4 text-slate-500">
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                                <span className="text-sm">Loading email...</span>
                                            </div>
                                        ) : emailBody?.html ? (
                                            <div
                                                className="email-html-body p-4"
                                                dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(emailBody.html) }}
                                            />
                                        ) : emailBody?.text ? (
                                            <pre className="text-base text-amber-200/80 p-4 leading-relaxed whitespace-pre-wrap font-sans">
                                                {emailBody.text}
                                            </pre>
                                        ) : (
                                            <p className="text-base text-amber-200/80 p-4 leading-relaxed">
                                                {selectedEmail.snippet}
                                            </p>
                                        )}
                                    </div>

                                    {/* AI Draft / Reply */}
                                    <div className="space-y-2">
                                        {isClassifierAvailable() && !draftText && (
                                            <button
                                                onClick={() => handleDraftAI(selectedEmail)}
                                                disabled={isDrafting}
                                                className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-sm text-indigo-400 transition-colors w-full"
                                            >
                                                <Edit3 className={`w-3.5 h-3.5 ${isDrafting ? 'animate-pulse' : ''}`} />
                                                {isDrafting ? 'Drafting...' : 'AI Draft Response'}
                                            </button>
                                        )}

                                        {(draftText || selectedEmail.ai_draft) && (
                                            <>
                                                <label className="block text-xs text-slate-500 uppercase tracking-wider">
                                                    {selectedEmail.ai_draft && !draftText ? 'AI Draft' : 'Reply'}
                                                </label>
                                                <textarea
                                                    value={draftText || selectedEmail.ai_draft || ''}
                                                    onChange={e => setDraftText(e.target.value)}
                                                    rows={4}
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                                />
                                            </>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2 mt-4 flex-wrap">
                                        <button
                                            onClick={() => { setSelectedEmail(null); setEmailBody(null); }}
                                            className="px-3 py-2 text-sm text-slate-500 hover:text-white transition-colors"
                                        >
                                            Close
                                        </button>
                                        <button
                                            onClick={() => handleMarkReviewed(selectedEmail)}
                                            className="px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-lg text-sm text-emerald-300 transition-colors flex items-center gap-1"
                                        >
                                            <Eye className="w-3 h-3" /> Reviewed
                                        </button>
                                        <button
                                            onClick={() => handleTrackResponse(selectedEmail)}
                                            className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg text-sm text-amber-300 transition-colors flex items-center gap-1"
                                        >
                                            <Clock className="w-3 h-3" /> Track
                                        </button>
                                        {/* Snooze dropdown */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setSnoozeDropdownId(snoozeDropdownId === selectedEmail.id ? null : selectedEmail.id)}
                                                className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg text-sm text-amber-300 transition-colors flex items-center gap-1"
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
                                                            className="block w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/10 transition-colors first:rounded-t-lg last:rounded-b-lg"
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleArchive(selectedEmail)}
                                            className="px-3 py-2 bg-slate-500/20 hover:bg-slate-500/30 rounded-lg text-sm text-slate-300 transition-colors flex items-center gap-1"
                                        >
                                            <Archive className="w-3 h-3" /> Archive
                                        </button>
                                        {draftText && isGoogleConnected() && (
                                            <button
                                                onClick={() => handleSend(selectedEmail)}
                                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all flex items-center gap-1"
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
                                <span className="text-sm text-slate-400 font-medium">{selectedEmails.size} selected</span>
                                <div className="h-4 w-px bg-white/10" />
                                <select
                                    onChange={e => { if (e.target.value) bulkClassify(e.target.value as EmailTier); e.target.value = ''; }}
                                    className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white"
                                    defaultValue=""
                                >
                                    <option value="" disabled>Classify as...</option>
                                    {ALL_TIERS.map(t => <option key={t} value={t}>{TIER_CONFIG[t].shortLabel}</option>)}
                                </select>
                                <button
                                    onClick={bulkArchiveSelected}
                                    className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-sm text-white transition-colors flex items-center gap-1"
                                >
                                    <Archive className="w-3 h-3" /> Archive
                                </button>
                                <button
                                    onClick={() => setSelectedEmails(new Set())}
                                    className="px-2 py-1.5 text-sm text-slate-500 hover:text-white transition-colors"
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
                </>,
                document.body
            )}
        </div>
    );
}
