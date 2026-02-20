import { motion } from 'framer-motion';
import { CheckCircle, Trash2, Archive, Shield, Globe } from 'lucide-react';

export interface SweepStats {
  unsubscribed: number;
  archived: number;
  kept: number;
  totalEmailsArchived: number;
  domainsProtected: number;
  sendersSkipped: number;
}

interface Props {
  stats: SweepStats;
  totalSenders: number;
  onClose: () => void;
}

export function UnsubscribeSweepSummary({ stats, totalSenders, onClose }: Props) {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex flex-col items-center text-center py-8 px-6"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
      >
        <CheckCircle className="w-12 h-12 text-emerald-400 mb-4" />
      </motion.div>

      <h2 className="text-lg font-bold text-white mb-1">Sweep Complete</h2>
      <p className="text-xs text-slate-500 mb-6">
        Reviewed {totalSenders} newsletter {totalSenders === 1 ? 'sender' : 'senders'}
      </p>

      <div className="grid grid-cols-3 gap-4 w-full max-w-xs mb-6">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col items-center gap-1 p-3 bg-red-500/10 rounded-lg"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
          <span className="text-xl font-bold text-red-400">{stats.unsubscribed}</span>
          <span className="text-xs text-slate-500 uppercase tracking-wider">Unsubscribed</span>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="flex flex-col items-center gap-1 p-3 bg-blue-500/10 rounded-lg"
        >
          <Archive className="w-4 h-4 text-blue-400" />
          <span className="text-xl font-bold text-blue-400">{stats.archived}</span>
          <span className="text-xs text-slate-500 uppercase tracking-wider">Archived</span>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="flex flex-col items-center gap-1 p-3 bg-emerald-500/10 rounded-lg"
        >
          <Shield className="w-4 h-4 text-emerald-400" />
          <span className="text-xl font-bold text-emerald-400">{stats.kept}</span>
          <span className="text-xs text-slate-500 uppercase tracking-wider">Kept</span>
        </motion.div>
      </div>

      {(stats.totalEmailsArchived > 0 || stats.domainsProtected > 0) && (
        <div className="text-xs text-slate-400 mb-6 space-y-1">
          {stats.totalEmailsArchived > 0 && (
            <p>{stats.totalEmailsArchived} total {stats.totalEmailsArchived === 1 ? 'email' : 'emails'} archived</p>
          )}
          {stats.domainsProtected > 0 && (
            <p className="flex items-center justify-center gap-1 text-purple-400">
              <Globe className="w-3 h-3" />
              {stats.domainsProtected} {stats.domainsProtected === 1 ? 'domain' : 'domains'} protected
              {stats.sendersSkipped > 0 && ` (${stats.sendersSkipped} senders auto-skipped)`}
            </p>
          )}
        </div>
      )}

      <button
        onClick={onClose}
        className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-bold text-white transition-colors"
      >
        Done
      </button>
    </motion.div>
  );
}
