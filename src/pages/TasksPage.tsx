import { TaskDashboard } from '../components/TaskDashboard';
import { BrainDump } from '../components/BrainDump';
import { useSignalStore } from '../store/signalStore';

export default function TasksPage() {
  const signals = useSignalStore(s => s.signals);

  const now = new Date().toISOString();
  const taskSignals = signals.filter(s =>
    !s.is_dismissed && (!s.expires_at || s.expires_at > now) &&
    (s.type === 'deadline_approaching' || s.type === 'follow_up_due' || s.type === 'streak_at_risk')
  );

  return (
    <div className="animate-fade-up space-y-6">
      {/* Task-related Signals */}
      {taskSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Task Alerts
          </div>
          <div className="p-3 space-y-2">
            {taskSignals.slice(0, 5).map(signal => (
              <div
                key={signal.id}
                className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                  signal.severity === 'critical' || signal.severity === 'urgent'
                    ? 'bg-red-500/10 border border-red-500/20 text-red-200'
                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-200'
                }`}
              >
                <span className="truncate">{signal.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <BrainDump />
      <div className="glass-card p-4 sm:p-6 min-h-[60vh]">
        <TaskDashboard />
      </div>
    </div>
  );
}
