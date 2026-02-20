import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Archive, Shield, Trash2, Globe } from 'lucide-react';
import {
  bulkArchiveBySender,
  buildUnsubscribeAction,
  performUnsubscribe,
  extractDomain,
  isProtected,
  isServiceNotification,
  protectSender,
  protectDomain,
} from '../services/newsletter-detector';
import { UnsubscribeSweepSummary } from './UnsubscribeSweepSummary';
import type { SweepStats } from './UnsubscribeSweepSummary';
import type { NewsletterSender } from '../services/newsletter-detector';
import type { TitanDatabase } from '../db';

interface Props {
  db: TitanDatabase;
  senders: NewsletterSender[];
  onClose: () => void;
}

/** Number of Keep actions on the same domain before prompting domain protection. */
const DOMAIN_KEEP_THRESHOLD = 2;

const cardVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 400 : -400,
    opacity: 0,
    scale: 0.95,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -400 : 400,
    opacity: 0,
    scale: 0.95,
  }),
};

const cardTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

export function UnsubscribeSweep({ db, senders: rawSenders, onClose }: Props) {
  // Filter out service notifications and already-protected senders upfront
  const sweepSenders = useMemo(() =>
    [...rawSenders]
      .filter(s => !isServiceNotification(s.address) && !isProtected(s.address))
      .sort((a, b) => b.emailCount - a.emailCount),
    [rawSenders]
  );

  const notificationCount = useMemo(() =>
    rawSenders.filter(s => isServiceNotification(s.address)).length,
    [rawSenders]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [sampleSubjects, setSampleSubjects] = useState<Map<string, string[]>>(new Map());
  const [stats, setStats] = useState<SweepStats>({
    unsubscribed: 0,
    archived: 0,
    kept: 0,
    totalEmailsArchived: 0,
    domainsProtected: 0,
    sendersSkipped: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [direction, setDirection] = useState(1);

  // Track how many times user clicked Keep per domain during this sweep
  const [domainKeepCounts, setDomainKeepCounts] = useState<Map<string, number>>(new Map());
  // When set, shows the "Protect entire domain?" prompt instead of a sender card
  const [domainPrompt, setDomainPrompt] = useState<{
    domain: string;
    remaining: number;
  } | null>(null);
  // Domains protected during this sweep session (to skip remaining senders)
  const [protectedDomains, setProtectedDomains] = useState<Set<string>>(new Set());

  // Immediately show summary if no senders after filtering
  useEffect(() => {
    if (sweepSenders.length === 0) {
      setIsComplete(true);
    }
  }, [sweepSenders.length]);

  // Load sample subjects on mount
  useEffect(() => {
    if (!db || sweepSenders.length === 0) return;

    const load = async () => {
      const map = new Map<string, string[]>();
      for (const sender of sweepSenders) {
        try {
          const escapedAddr = sender.address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const docs = await db.emails.find({
            selector: { from: { $regex: escapedAddr }, is_newsletter: true },
            sort: [{ received_at: 'desc' }],
            limit: 3,
          }).exec();
          map.set(sender.address, docs.map(d => d.toJSON().subject as string));
        } catch {
          map.set(sender.address, []);
        }
      }
      setSampleSubjects(map);
    };

    load();
  }, [db, sweepSenders]);

  /** Find the next non-skipped sender index starting from `from`. Returns -1 if none. */
  const findNextIndex = useCallback((from: number): number => {
    for (let i = from; i < sweepSenders.length; i++) {
      const domain = extractDomain(sweepSenders[i].address);
      if (!protectedDomains.has(domain)) return i;
    }
    return -1;
  }, [sweepSenders, protectedDomains]);

  /** Advance to the next non-skipped sender, or complete. */
  const advance = useCallback(() => {
    const next = findNextIndex(currentIndex + 1);
    if (next === -1) {
      setIsComplete(true);
    } else {
      setDirection(1);
      setCurrentIndex(next);
    }
  }, [currentIndex, findNextIndex]);

  /** Count remaining senders from a domain after the current index. */
  const countRemainingFromDomain = useCallback((domain: string): number => {
    let count = 0;
    for (let i = currentIndex + 1; i < sweepSenders.length; i++) {
      if (extractDomain(sweepSenders[i].address) === domain && !protectedDomains.has(domain)) {
        count++;
      }
    }
    return count;
  }, [currentIndex, sweepSenders, protectedDomains]);

  const handleKeep = useCallback(() => {
    const sender = sweepSenders[currentIndex];
    const domain = extractDomain(sender.address);

    // Persist this sender as protected
    protectSender(sender.address);
    setStats(s => ({ ...s, kept: s.kept + 1 }));

    // Track domain keep count
    const newCounts = new Map(domainKeepCounts);
    const newCount = (newCounts.get(domain) || 0) + 1;
    newCounts.set(domain, newCount);
    setDomainKeepCounts(newCounts);

    // Check if we should prompt for domain protection
    const remaining = countRemainingFromDomain(domain);
    if (newCount >= DOMAIN_KEEP_THRESHOLD && remaining > 0) {
      setDomainPrompt({ domain, remaining });
    } else {
      advance();
    }
  }, [sweepSenders, currentIndex, domainKeepCounts, countRemainingFromDomain, advance]);

  const handleProtectDomain = useCallback(() => {
    if (!domainPrompt) return;
    const { domain, remaining } = domainPrompt;

    protectDomain(domain);
    setProtectedDomains(prev => new Set(prev).add(domain));
    setStats(s => ({
      ...s,
      domainsProtected: s.domainsProtected + 1,
      sendersSkipped: s.sendersSkipped + remaining,
      kept: s.kept + remaining,
    }));
    setDomainPrompt(null);

    // Advance past all senders from this now-protected domain
    const next = findNextIndex(currentIndex + 1);
    if (next === -1) {
      setIsComplete(true);
    } else {
      setDirection(1);
      setCurrentIndex(next);
    }
  }, [domainPrompt, currentIndex, findNextIndex]);

  const handleReviewIndividually = useCallback(() => {
    setDomainPrompt(null);
    advance();
  }, [advance]);

  const handleArchiveOnly = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const sender = sweepSenders[currentIndex];
      const count = await bulkArchiveBySender(db, sender.address);
      setStats(s => ({
        ...s,
        archived: s.archived + 1,
        totalEmailsArchived: s.totalEmailsArchived + count,
      }));
      advance();
    } catch (err) {
      console.error('[UnsubscribeSweep] Archive failed:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, sweepSenders, currentIndex, db, advance]);

  const handleUnsubAndArchive = useCallback(async () => {
    if (isProcessing) return;
    const sender = sweepSenders[currentIndex];
    const action = buildUnsubscribeAction(sender);
    if (!action) return;

    setIsProcessing(true);
    try {
      const result = await performUnsubscribe(sender);
      console.log(`[UnsubscribeSweep] ${sender.address}: ${result.method} — ${result.message}`);

      const count = await bulkArchiveBySender(db, sender.address);
      setStats(s => ({
        ...s,
        unsubscribed: s.unsubscribed + 1,
        totalEmailsArchived: s.totalEmailsArchived + count,
      }));
      advance();
    } catch (err) {
      console.error('[UnsubscribeSweep] Unsub+Archive failed:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, sweepSenders, currentIndex, db, advance]);

  // Count non-skipped senders for progress display
  const activeSenderCount = useMemo(() =>
    sweepSenders.filter(s => !protectedDomains.has(extractDomain(s.address))).length,
    [sweepSenders, protectedDomains]
  );
  // How many non-skipped senders have been reviewed (are before currentIndex)
  const reviewedCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < currentIndex; i++) {
      if (!protectedDomains.has(extractDomain(sweepSenders[i].address))) count++;
    }
    return count;
  }, [currentIndex, sweepSenders, protectedDomains]);

  const currentSender = sweepSenders[currentIndex];
  const currentAction = currentSender ? buildUnsubscribeAction(currentSender) : null;
  const subjects = currentSender ? (sampleSubjects.get(currentSender.address) || []) : [];
  const progress = activeSenderCount > 0
    ? ((reviewedCount + (isComplete ? 1 : 0)) / activeSenderCount) * 100
    : 100;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="glass-card w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white">Unsubscribe Sweep</h2>
            {!isComplete && activeSenderCount > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">
                {reviewedCount + 1} / {activeSenderCount}
                {notificationCount > 0 && (
                  <span className="text-slate-600 ml-1">
                    ({notificationCount} service notifications auto-skipped)
                  </span>
                )}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Progress Bar */}
        {!isComplete && activeSenderCount > 0 && (
          <div className="px-5 pb-3">
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-emerald-500 to-purple-500 rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {isComplete ? (
            <UnsubscribeSweepSummary
              stats={stats}
              totalSenders={activeSenderCount + stats.sendersSkipped}
              onClose={onClose}
            />
          ) : domainPrompt ? (
            /* Domain Protection Prompt */
            <AnimatePresence mode="wait">
              <motion.div
                key={`domain-${domainPrompt.domain}`}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={cardTransition}
                className="flex flex-col items-center text-center py-4"
              >
                <Globe className="w-8 h-8 text-purple-400 mb-3" />
                <h3 className="text-sm font-bold text-white mb-1">
                  Protect all from {domainPrompt.domain}?
                </h3>
                <p className="text-xs text-slate-400 mb-1">
                  You've kept {domainKeepCounts.get(domainPrompt.domain) || 0} senders from this domain.
                </p>
                <p className="text-xs text-slate-500 mb-5">
                  {domainPrompt.remaining} more {domainPrompt.remaining === 1 ? 'sender' : 'senders'} from <span className="text-slate-400">{domainPrompt.domain}</span> still in queue.
                </p>

                <div className="flex gap-3 w-full max-w-xs">
                  <button
                    onClick={handleReviewIndividually}
                    className="flex-1 px-3 py-2.5 border border-white/10 hover:bg-white/5 rounded-lg text-xs text-slate-400 transition-colors"
                  >
                    Review each
                  </button>
                  <button
                    onClick={handleProtectDomain}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/20 rounded-lg text-xs text-purple-300 font-medium transition-colors"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Protect all
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          ) : currentSender ? (
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentSender.address}
                custom={direction}
                variants={cardVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={cardTransition}
              >
                {/* Sender Info */}
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-white truncate">
                    {currentSender.displayName}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    {currentSender.address}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-slate-400">
                      {currentSender.emailCount} {currentSender.emailCount === 1 ? 'email' : 'emails'}
                    </span>
                    <span className="text-xs text-slate-600">
                      Last: {new Date(currentSender.lastReceived).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {currentAction && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                        currentSender.hasOneClickUnsubscribe || currentSender.hasUnsubscribeMailto
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {currentSender.hasOneClickUnsubscribe ? 'Auto-unsub'
                          : currentSender.hasUnsubscribeMailto ? 'Email unsub'
                          : 'Manual unsub'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sample Subjects */}
                {subjects.length > 0 && (
                  <div className="bg-white/5 rounded-lg p-3 mb-5">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                      Recent emails
                    </p>
                    {subjects.map((subj, i) => (
                      <p key={i} className="text-xs text-slate-400 truncate leading-relaxed">
                        {subj}
                      </p>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleKeep}
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 border border-white/10 hover:bg-white/5 rounded-lg text-xs text-slate-400 transition-colors disabled:opacity-50"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Keep
                  </button>

                  <button
                    onClick={handleArchiveOnly}
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-500/20 hover:bg-slate-500/30 rounded-lg text-xs text-slate-300 transition-colors disabled:opacity-50"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    Archive
                  </button>

                  <button
                    onClick={handleUnsubAndArchive}
                    disabled={isProcessing || !currentAction}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-xs text-purple-300 transition-colors disabled:opacity-50"
                    title={!currentAction ? 'No unsubscribe link available' : 'Unsubscribe and archive all'}
                  >
                    {currentAction ? (
                      <>
                        <ExternalLink className="w-3.5 h-3.5" />
                        Unsub
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        Unsub
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
