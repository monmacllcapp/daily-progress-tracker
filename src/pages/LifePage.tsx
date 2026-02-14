import { WheelOfLife } from '../components/WheelOfLife';
import { CategoryManager } from '../components/CategoryManager';
import { VisionBoardGallery } from '../components/VisionBoardGallery';
import { SignalFeed } from '../components/v2/SignalFeed';
import { useSignalStore } from '../store/signalStore';

export default function LifePage() {
  const signals = useSignalStore(s => s.signals);

  const now = new Date().toISOString();
  const lifeSignals = signals.filter(s =>
    !s.is_dismissed && (!s.expires_at || s.expires_at > now) &&
    (s.domain === 'health_fitness' || s.domain === 'personal_growth')
  );

  return (
    <div className="animate-fade-up space-y-6">
      {/* Life Domain Signals */}
      {lifeSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Life Signals
          </div>
          <SignalFeed filterDomain="health_fitness" maxSignals={3} />
          <SignalFeed filterDomain="personal_growth" maxSignals={3} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-4 sm:p-6">
          <WheelOfLife />
        </div>
        <div className="glass-card p-4 sm:p-6">
          <CategoryManager />
        </div>
      </div>
      <div className="glass-card p-4 sm:p-6">
        <VisionBoardGallery />
      </div>
    </div>
  );
}
