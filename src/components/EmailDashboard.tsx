import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mail, AlertCircle, MessageSquare, Tag, Trash2,
    RefreshCw, Send, Edit3, Archive, ChevronDown, ChevronRight, Trophy,
    Clock, Bell, ExternalLink, Newspaper, Sparkles
} from 'lucide-react';
import { createDatabase } from '../db';
import { isGoogleConnected, requestGoogleAuth, isGoogleAuthAvailable } from '../services/google-auth';
import { syncGmailInbox, archiveMessage, sendReply } from '../services/gmail';
import { classifyEmail, draftResponse, isClassifierAvailable } from '../services/email-classifier';
import { scoreAllEmails } from '../services/email-scorer';
import { detectNewsletters, getNewsletterSenders, bulkArchiveBySender, buildUnsubscribeAction } from '../services/newsletter-detector';
import { snoozeEmail, unsnoozeEmail } from '../services/email-snooze';
import type { NewsletterSender } from '../services/newsletter-detector';
import type { SnoozePreset } from '../services/email-snooze';
import type { Email, EmailTier } from '../types/schema';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';
import { UnsubscribeSweep } from './UnsubscribeSweep';

const TIER_CONFIG: Record<EmailTier, { label: string; icon: typeof AlertCircle; color: string; bgColor: string; bgLight: string; bgMedium: string }> = {
    urgent: { label: 'Urgent', icon: AlertCircle, color: 'text-red-400', bgColor: 'bg-red-500', bgLight: 'bg-red-500/20', bgMedium: 'bg-red-500/30' },
    important: { label: 'Important', icon: MessageSquare, color: 'text-blue-400', bgColor: 'bg-blue-500', bgLight: 'bg-blue-500/20', bgMedium: 'bg-blue-500/30' },
    promotions: { label: 'Promotions', icon: Tag, color: 'text-amber-400', bgColor: 'bg-amber-500', bgLight: 'bg-amber-500/20', bgMedium: 'bg-amber-500/30' },
    unsubscribe: { label: 'Unsubscribe', icon: Trash2, color: 'text-slate-400', bgColor: 'bg-slate-500', bgLight: 'bg-slate-500/20', bgMedium: 'bg-slate-500/30' },
};

const TIER_ORDER: EmailTier[] = ['urgent', 'important', 'promotions', 'unsubscribe'];

export function EmailDashboard() {
    const [db] = useDatabase();
    const [emails] = useRxQuery<Email>(db?.emails, { sort: [{ received_at: 'desc' }] });
    const [isSyncing, setIsSyncing] = useState(false);
    const [expandedTiers, setExpandedTiers] = useState<Set<EmailTier>>(new Set(['urgent', 'important']));
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [draftText, setDraftText] = useState('');
    const [isDrafting, setIsDrafting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [newsletterSenders, setNewsletterSenders] = useState<NewsletterSender[]>([]);
    const [showNewsletters, setShowNewsletters] = useState(false);
    const [showSnoozed, setShowSnoozed] = useState(false);
    const [snoozeDropdownId, setSnoozeDropdownId] = useState<string | null>(null);
    const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [showSweep, setShowSweep] = useState(false);

    // Load newsletter senders when db is ready
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
            // Post-sync: score emails and detect newsletters
            await scoreAllEmails(db);
            await detectNewsletters(db);
            setNewsletterSenders(await getNewsletterSenders(db));
            showToast(newCount > 0 ? `Synced ${newCount} new emails` : 'Inbox up to date');
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
        try {
            if (isGoogleConnected()) {
                await archiveMessage(email.gmail_id);
            }
            const db = await createDatabase();
            const doc = await db.emails.findOne(email.id).exec();
            if (doc) await doc.patch({ status: 'archived', updated_at: new Date().toISOString() });
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
            setSelectedEmail({ ...email, tier_override: newTier });
            showToast(`Moved to ${TIER_CONFIG[newTier].label}`);
        }
    };

    const handleDraftAI = async (email: Email) => {
        setIsDrafting(true);
        try {
            const draft = await draftResponse(email.from, email.subject, email.snippet);
            if (draft) {
                setDraftText(draft);
                // Save draft to DB
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
            await sendReply(
                email.thread_id || email.gmail_id,
                email.from,
                `Re: ${email.subject}`,
                draftText
            );
            const db = await createDatabase();
            const doc = await db.emails.findOne(email.id).exec();
            if (doc) await doc.patch({ status: 'replied', updated_at: new Date().toISOString() });
            setSelectedEmail(null);
            setDraftText('');
            showToast('Reply sent');
        } catch (err) {
            console.error('[EmailDashboard] Send failed:', err);
            showToast('Failed to send');
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
    // Sort within each tier by score (highest first)
    for (const tier of TIER_ORDER) {
        emailsByTier.get(tier)?.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    // Snoozed emails
    const snoozedEmails = emails.filter(e => e.status === 'snoozed');

    const totalActive = emails.filter(e => e.status !== 'archived' && e.status !== 'replied' && e.status !== 'snoozed').length;
    const processedCount = emails.filter(e => e.status === 'archived' || e.status === 'replied').length;
    const inboxZeroProgress = emails.length > 0 ? (processedCount / emails.length) * 100 : 0;

    return (
        <div className="flex flex-col text-white">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
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
                            transition={{ type: 'spring', stiffness: 100, damping: 20 }} /> </div> {inboxZeroProgress >= 100 && ( <p className="text-[10px] text-emerald-400 mt-1 text-center font-bold">Inbox Zero achieved!</p> )} </div> )} {/* Tier Groups */} <div> {emails.length === 0 ? ( <div className="flex flex-col items-center justify-center py-12 text-slate-600"> <Mail className="w-8 h-8 mb-2 opacity-50" /> <p className="text-xs">No emails synced yet</p> {isGoogleAuthAvailable() && ( <button onClick={handleSync} className="text-xs text-blue-400 mt-2 hover:underline"> Connect Gmail </button> )} </div> ) : ( TIER_ORDER.map(tier => { const tierEmails = emailsByTier.get(tier) || []; if (tierEmails.length === 0) return null; const config = TIER_CONFIG[tier]; const Icon = config.icon; const isExpanded = expandedTiers.has(tier); return ( <div key={tier} className="border-b border-white/5"> <button onClick={() => toggleTier(tier)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors" > {isExpanded ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" /> } <Icon className={`w-3.5 h-3.5 ${config.color}`} /> <span className={`text-xs font-bold uppercase tracking-wider ${config.color}`}> {config.label} </span> <span className={`text-[10px] px-1.5 py-0.5 ${config.bgLight} ${config.color} rounded-full font-bold`}> {tierEmails.length} </span> </button> <AnimatePresence> {isExpanded && tierEmails.map(email => ( <motion.div key={email.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="px-3"
                                        >
                                            <div
                                                className={`flex items-start gap-2 py-2 px-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer group ${ email.status === 'unread' ? 'border-l-2 border-blue-400' : 'border-l-2 border-transparent' }`}
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
                                                    <p className={`text-xs truncate mt-0.5 ${email.status === 'unread' ? 'text-slate-300' : 'text-slate-500'}`}> {email.subject} </p> <p className="text-[10px] text-slate-600 truncate">{email.snippet}</p> </div> {/* Quick Actions */} <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"> <button onClick={e => { e.stopPropagation(); handleArchive(email); }} className="p-1 hover:bg-white/10 rounded" title="Archive" > <Archive className="w-3 h-3 text-slate-400" /> </button> </div> </div> </motion.div> ))} </AnimatePresence> </div> ); }) )} </div>

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

            {/* Email Detail / Reply Modal */} <AnimatePresence> {selectedEmail && ( <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setSelectedEmail(null)} > <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} onClick={e => e.stopPropagation()} className="glass-card p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto" > {/* Header */} <div className="flex items-start justify-between mb-3"> <div className="min-w-0 flex-1"> <h3 className="text-sm font-bold text-white truncate">{selectedEmail.subject}</h3> <p className="text-xs text-slate-500 mt-0.5">{selectedEmail.from}</p> <p className="text-[10px] text-slate-600"> {new Date(selectedEmail.received_at).toLocaleString()} </p> </div> {/* Tier Reclassify */} <div className="flex gap-1 ml-2 flex-shrink-0"> {TIER_ORDER.map(t => { const cfg = TIER_CONFIG[t]; const TierIcon = cfg.icon; const effectiveTier = selectedEmail.tier_override || selectedEmail.tier; return ( <button key={t} onClick={() => handleReclassify(selectedEmail, t)} className={`p-1 rounded transition-colors ${effectiveTier === t ? `${cfg.bgMedium}` : 'hover:bg-white/10'}`} title={cfg.label} > <TierIcon className={`w-3 h-3 ${cfg.color}`} /> </button> ); })} </div> </div> {/* Snippet */} <div className="text-xs text-slate-400 bg-white/5 rounded-lg p-3 mb-3"> {selectedEmail.snippet} </div> {/* AI Draft / Reply */} <div className="space-y-2"> {isClassifierAvailable() && !draftText && ( <button onClick={() => handleDraftAI(selectedEmail)} disabled={isDrafting} className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-xs text-indigo-400 transition-colors w-full" > <Edit3 className={`w-3.5 h-3.5 ${isDrafting ? 'animate-pulse' : ''}`} />
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
                        className="fixed bottom-6 right-6 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50"
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
