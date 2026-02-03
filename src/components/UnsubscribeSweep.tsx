import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Archive, Shield, Trash2 } from 'lucide-react';
import { bulkArchiveBySender, buildUnsubscribeAction } from '../services/newsletter-detector';
import { UnsubscribeSweepSummary } from './UnsubscribeSweepSummary';
import type { SweepStats } from './UnsubscribeSweepSummary';
import type { NewsletterSender } from '../services/newsletter-detector';
import type { TitanDatabase } from '../db';

interface Props {
  db: TitanDatabase;
  senders: NewsletterSender[];
  onClose: () => void;
}

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [senders] = useState(() =>
    [...rawSenders].sort((a, b) => b.emailCount - a.emailCount)
  );
  const [sampleSubjects, setSampleSubjects] = useState<Map<string, string[]>>(new Map());
  const [stats, setStats] = useState<SweepStats>({
    unsubscribed: 0,
    archived: 0,
    kept: 0,
    totalEmailsArchived: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [direction, setDirection] = useState(1);

  // Immediately show summary if no senders
  useEffect(() => {
    if (senders.length === 0) {
      setIsComplete(true);
    }
  }, [senders.length]);

  // Load sample subjects for all senders on mount
  useEffect(() => {
    if (!db || senders.length === 0) return;

    const load = async () => {
      const map = new Map<string, string[]>();
      for (const sender of senders) {
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
  }, [db, senders]);

  const advance = useCallback(() => {
    if (currentIndex >= senders.length - 1) {
      setIsComplete(true);
    } else {
      setDirection(1);
      setCurrentIndex(i => i + 1);
    }
  }, [currentIndex, senders.length]);

  const handleKeep = useCallback(() => {
    setStats(s => ({ ...s, kept: s.kept + 1 }));
    advance();
  }, [advance]);

  const handleArchiveOnly = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const sender = senders[currentIndex];
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
  }, [isProcessing, senders, currentIndex, db, advance]);

  const handleUnsubAndArchive = useCallback(async () => {
    if (isProcessing) return;
    const sender = senders[currentIndex];
    const action = buildUnsubscribeAction(sender);
    if (!action) return;

    setIsProcessing(true);
    try {
      // Open unsubscribe link
      if (action.type === 'url') {
        window.open(action.target, '_blank', 'noopener,noreferrer');
      } else {
        window.open(action.target, '_blank');
      }

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
  }, [isProcessing, senders, currentIndex, db, advance]);

  const currentSender = senders[currentIndex];
  const currentAction = currentSender ? buildUnsubscribeAction(currentSender) : null;
  const subjects = currentSender ? (sampleSubjects.get(currentSender.address) || []) : [];
  const progress = senders.length > 0 ? ((currentIndex + (isComplete ? 1 : 0)) / senders.length) * 100 : 100;

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
            {!isComplete && senders.length > 0 && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                {currentIndex + 1} / {senders.length}
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
        {!isComplete && senders.length > 0 && (
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
              totalSenders={senders.length}
              onClose={onClose}
            />
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
                  <p className="text-[10px] text-slate-500 truncate">
                    {currentSender.address}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-slate-400">
                      {currentSender.emailCount} {currentSender.emailCount === 1 ? 'email' : 'emails'}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      Last: {new Date(currentSender.lastReceived).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {currentAction && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold">
                        Unsub available
                      </span>
                    )}
                  </div>
                </div>

                {/* Sample Subjects */}
                {subjects.length > 0 && (
                  <div className="bg-white/5 rounded-lg p-3 mb-5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
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
