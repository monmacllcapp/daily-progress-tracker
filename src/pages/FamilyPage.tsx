import { FamilyHub } from '../components/v2/FamilyHub';

export default function FamilyPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="bg-slate-900/50 border border-white/10 rounded-xl">
        <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Family Hub
        </div>
        <FamilyHub />
      </div>
    </div>
  );
}
