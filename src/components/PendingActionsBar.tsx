import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Check, X, ChevronDown, ChevronUp, Archive, ArrowRight, Loader2 } from 'lucide-react';
import type { PendingAction } from '../services/email-rules-engine';

interface PendingActionsBarProps {
  pendingActions: PendingAction[];
  onApplyAll: () => void;
  onApplyOne: (action: PendingAction) => void;
  onDismissOne: (action: PendingAction) => void;
  onDismissAll: () => void;
  isApplying: boolean;
}

export function PendingActionsBar({
  pendingActions,
  onApplyAll,
  onApplyOne,
  onDismissOne,
  onDismissAll,
  isApplying,
}: PendingActionsBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (pendingActions.length === 0) return null;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="border-b border-purple-500/20 bg-purple-500/5"
    >
      {/* Collapsed bar */}
      <div className="flex items-center justify-between px-3 py-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          <Brain className="w-3.5 h-3.5" />
          <span className="font-medium">
            {pendingActions.length} suggestion{pendingActions.length !== 1 ? 's' : ''} ready
          </span>
          {isExpanded
            ? <ChevronUp className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />
          }
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onApplyAll}
            disabled={isApplying}
            className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 rounded text-xs text-purple-300 font-medium transition-colors disabled:opacity-50"
          >
            {isApplying ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            Apply All
          </button>
          <button
            onClick={onDismissAll}
            className="flex items-center gap-1 px-2 py-1 hover:bg-white/10 rounded text-xs text-slate-500 transition-colors"
          >
            <X className="w-3 h-3" />
            Dismiss
          </button>
        </div>
      </div>

      {/* Expanded list */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-1">
              {pendingActions.map(action => (
                <div
                  key={action.emailId}
                  className="flex items-center gap-2 py-1.5 px-2 rounded bg-white/5 hover:bg-white/10 transition-colors group"
                >
                  {/* Action badge */}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${
                    action.action === 'archive'
                      ? 'bg-slate-500/20 text-slate-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {action.action === 'archive' ? (
                      <Archive className="w-2.5 h-2.5 inline" />
                    ) : (
                      <ArrowRight className="w-2.5 h-2.5 inline" />
                    )}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-300 truncate">
                        {action.from.split('<')[0].trim()}
                      </span>
                      <span className="text-[9px] text-slate-600">—</span>
                      <span className="text-xs text-slate-500 truncate">
                        {action.subject}
                      </span>
                    </div>
                    <span className="text-[9px] text-purple-500">{action.ruleDescription}</span>
                  </div>

                  {/* Per-item actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => onApplyOne(action)}
                      className="p-1 hover:bg-purple-500/20 rounded text-purple-400"
                      title="Apply"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onDismissOne(action)}
                      className="p-1 hover:bg-white/10 rounded text-slate-500"
                      title="Dismiss"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
