import { FamilyHub } from '../components/v2/FamilyHub';
import { SignalFeed } from '../components/v2/SignalFeed';
import { useSignalStore } from '../store/signalStore';

export default function FamilyPage() {
  const signals = useSignalStore(s => s.signals);

  const now = new Date().toISOString();
  const familySignals = signals.filter(s =>
    !s.is_dismissed && (!s.expires_at || s.expires_at > now) && s.domain === 'family'
  );

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Family Signals */}
      {familySignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Family Signals
          </div>
          <SignalFeed filterDomain="family" maxSignals={5} />
        </div>
      )}

      <div className="bg-slate-900/50 border border-white/10 rounded-xl">
        <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Family Hub
        </div>
        <FamilyHub signals={familySignals} />
      </div>
    </div>
  );
}
