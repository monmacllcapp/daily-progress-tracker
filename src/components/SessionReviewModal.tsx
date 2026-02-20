import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, User, FileText, Brain, Check, X, ChevronDown, MessageSquare } from 'lucide-react';
import type { DetectedPattern } from '../services/email-pattern-analyzer';

interface SessionReviewModalProps {
  patterns: DetectedPattern[];
  onConfirm: (patternIds: string[]) => void;
  onClose: () => void;
  actionCount: number;
}

const PATTERN_ICONS: Record<string, typeof Globe> = {
  'domain-action': Globe,
  'sender-action': User,
  'subject-keyword-action': FileText,
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

export function SessionReviewModal({ patterns, onConfirm, onClose, actionCount }: SessionReviewModalProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(patterns.filter(p => p.confidence >= 0.5).map(p => p.id))
  );
  const [feedbackOpen, setFeedbackOpen] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const togglePattern = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFeedback = (id: string) => {
    setFeedbackOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confidenceColor = (c: number) =>
    c >= 0.8 ? 'bg-emerald-500' : c >= 0.5 ? 'bg-amber-500' : 'bg-red-500';

  const confidenceLabel = (c: number) =>
    c >= 0.8 ? 'text-emerald-400' : c >= 0.5 ? 'text-amber-400' : 'text-red-400';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="glass-card p-5 w-full max-w-lg max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <h2 className="text-sm font-bold text-white">Session Review</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-500">
              {actionCount} action{actionCount !== 1 ? 's' : ''} this session
            </span>
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Pattern List */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
          {patterns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500">
              <Brain className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs">No patterns detected yet.</p>
              <p className="text-[10px] text-slate-600 mt-1">Keep triaging to build patterns!</p>
              <span className="text-[10px] text-slate-600 mt-2">
                {actionCount} action{actionCount !== 1 ? 's' : ''} recorded
              </span>
            </div>
          ) : (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-2">
              {patterns.map(pattern => {
                const Icon = PATTERN_ICONS[pattern.type] || FileText;
                const isSelected = selected.has(pattern.id);
                const isFeedbackOpen = feedbackOpen.has(pattern.id);

                return (
                  <motion.div
                    key={pattern.id}
                    variants={itemVariants}
                    className={`rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-purple-500/10 border-purple-500/30'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div
                      className="flex items-start gap-3 p-3 cursor-pointer"
                      onClick={() => togglePattern(pattern.id)}
                    >
                      {/* Checkbox */}
                      <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-purple-500 border-purple-500'
                          : 'border-slate-600 hover:border-slate-400'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>

                      {/* Icon */}
                      <div className={`p-1.5 rounded ${isSelected ? 'bg-purple-500/20' : 'bg-white/5'} flex-shrink-0`}>
                        <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-purple-400' : 'text-slate-400'}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white font-medium">{pattern.description}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] text-slate-500">
                            Based on {pattern.evidenceCount} action{pattern.evidenceCount !== 1 ? 's' : ''}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${confidenceColor(pattern.confidence)}`}
                                style={{ width: `${Math.round(pattern.confidence * 100)}%` }}
                              />
                            </div>
                            <span className={`text-[9px] font-mono ${confidenceLabel(pattern.confidence)}`}>
                              {Math.round(pattern.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Feedback toggle */}
                      <button
                        onClick={e => { e.stopPropagation(); toggleFeedback(pattern.id); }}
                        className="p-1 hover:bg-white/10 rounded flex-shrink-0 transition-colors"
                        title="Add feedback"
                      >
                        {isFeedbackOpen
                          ? <ChevronDown className="w-3 h-3 text-slate-500" />
                          : <MessageSquare className="w-3 h-3 text-slate-500" />
                        }
                      </button>
                    </div>

                    {/* Feedback area */}
                    <AnimatePresence>
                      {isFeedbackOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3">
                            <textarea
                              value={feedback[pattern.id] || ''}
                              onChange={e => setFeedback(prev => ({ ...prev, [pattern.id]: e.target.value }))}
                              placeholder={isSelected ? 'Optional corrections or notes...' : 'Why is this wrong?'}
                              rows={2}
                              className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white text-[11px] focus:outline-none focus:border-purple-500/50 transition-colors resize-none placeholder:text-slate-600"
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* Footer */}
        {patterns.length > 0 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
            <span className="text-[10px] text-slate-500">
              {selected.size} of {patterns.length} selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-white transition-colors"
              >
                Skip
              </button>
              <button
                onClick={() => onConfirm(Array.from(selected))}
                disabled={selected.size === 0}
                className="px-4 py-1.5 bg-purple-500 hover:bg-purple-600 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-xs font-bold text-white transition-all"
              >
                Confirm {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
