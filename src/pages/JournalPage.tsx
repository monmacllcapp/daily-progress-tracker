import { useState, useMemo, useCallback } from 'react';
import { Plus, X, BookOpen, Heart, Target, Flame } from 'lucide-react';
import { JournalHistory } from '../components/JournalHistory';
import { SignalFeed } from '../components/v2/SignalFeed';
import { useSignalStore } from '../store/signalStore';
import { useDatabase } from '../hooks/useDatabase';

export default function JournalPage() {
  const [db] = useDatabase();
  const allSignals = useSignalStore(s => s.signals);
  const growthSignals = useMemo(() => {
    const now = new Date().toISOString();
    return allSignals.filter(sig =>
      !sig.is_dismissed &&
      (!sig.expires_at || sig.expires_at > now) &&
      sig.domain === 'personal_growth'
    );
  }, [allSignals]);

  const [showForm, setShowForm] = useState(false);
  const [gratitude, setGratitude] = useState(['', '', '']);
  const [wins, setWins] = useState(['', '', '']);
  const [stressors, setStressors] = useState(['']);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const resetForm = useCallback(() => {
    setGratitude(['', '', '']);
    setWins(['', '', '']);
    setStressors(['']);
    setShowForm(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!db) return;
    const ts = new Date().toISOString();
    const gratItems = gratitude.map(g => g.trim()).filter(Boolean);
    const winItems = wins.map(w => w.trim()).filter(Boolean);
    const stressItems = stressors.map(s => s.trim()).filter(Boolean);

    if (gratItems.length === 0 && winItems.length === 0 && stressItems.length === 0) return;

    // Check if entry for today already exists
    const existing = await db.daily_journal.findOne({ selector: { date: todayStr } }).exec();

    if (existing) {
      // Merge with existing
      await existing.patch({
        gratitude: [...(existing.gratitude || []), ...gratItems],
        non_negotiables: [...(existing.non_negotiables || []), ...winItems],
        stressors: [...(existing.stressors || []), ...stressItems],
        updated_at: ts,
      });
    } else {
      await db.daily_journal.insert({
        id: crypto.randomUUID(),
        date: todayStr,
        gratitude: gratItems,
        non_negotiables: winItems,
        stressors: stressItems,
        habits: {},
        created_at: ts,
        updated_at: ts,
      });
    }
    resetForm();
  }, [db, gratitude, wins, stressors, todayStr, resetForm]);

  const updateListItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addListItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(prev => [...prev, '']);
  };

  return (
    <div className="animate-fade-up space-y-6">
      {/* Personal Growth Signals */}
      {growthSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Growth Insights
          </div>
          <SignalFeed filterDomain="personal_growth" maxSignals={3} />
        </div>
      )}

      {/* Quick Entry Button */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-purple-400" />
          Journal
        </h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 text-purple-400 text-sm font-medium rounded-lg hover:bg-purple-500/30 transition-colors"
        >
          <Plus className="w-4 h-4" /> Quick Entry
        </button>
      </div>

      {/* Quick Entry Form */}
      {showForm && (
        <div className="bg-slate-900/50 border border-purple-500/20 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Journal Entry — {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </h3>
            <button onClick={resetForm} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Gratitude */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Heart className="w-3.5 h-3.5 text-pink-400" />
              <span className="text-xs text-pink-400 uppercase tracking-wider font-bold">Gratitude</span>
            </div>
            {gratitude.map((item, i) => (
              <input
                key={i}
                value={item}
                onChange={e => updateListItem(setGratitude, i, e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50 mb-1.5"
                placeholder={`I'm grateful for...`}
              />
            ))}
          </div>

          {/* Non-negotiable Wins */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-xs text-rose-400 uppercase tracking-wider font-bold">Wins / Non-Negotiables</span>
            </div>
            {wins.map((item, i) => (
              <input
                key={i}
                value={item}
                onChange={e => updateListItem(setWins, i, e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/50 mb-1.5"
                placeholder="If I do this, today is a win..."
              />
            ))}
          </div>

          {/* Stressors */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-xs text-orange-400 uppercase tracking-wider font-bold">Stressors</span>
            </div>
            {stressors.map((item, i) => (
              <input
                key={i}
                value={item}
                onChange={e => updateListItem(setStressors, i, e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 mb-1.5"
                placeholder="What's weighing on me..."
              />
            ))}
            <button
              onClick={() => addListItem(setStressors)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              + add another
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-sm font-medium bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            >
              Save Entry
            </button>
          </div>
        </div>
      )}

      <div className="glass-card p-4 sm:p-6 min-h-[60vh]">
        <JournalHistory />
      </div>
    </div>
  );
}
