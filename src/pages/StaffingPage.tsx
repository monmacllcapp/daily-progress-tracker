import { useMemo } from 'react';
import { StaffingDashboard } from '../components/StaffingDashboard';
import { SignalFeed } from '../components/v2/SignalFeed';
import { useSignalStore } from '../store/signalStore';

export default function StaffingPage() {
  const allSignals = useSignalStore(s => s.signals);
  const techSignals = useMemo(() => {
    const now = new Date().toISOString();
    return allSignals.filter(sig =>
      !sig.is_dismissed &&
      (!sig.expires_at || sig.expires_at > now) &&
      sig.domain === 'business_tech'
    );
  }, [allSignals]);

  return (
    <div className="animate-fade-up space-y-6">
      {/* Staffing Signals */}
      {techSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Staffing Alerts
          </div>
          <SignalFeed filterDomain="business_tech" maxSignals={3} />
        </div>
      )}

      <div className="glass-card p-4 sm:p-6 min-h-[80vh]">
        <StaffingDashboard pageMode />
      </div>
    </div>
  );
}
