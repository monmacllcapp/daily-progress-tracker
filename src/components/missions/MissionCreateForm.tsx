import { useState } from 'react';
import { useDatabase } from '../../hooks/useDatabase';
import { AGENTS } from '../../services/agent-tracker';

interface MissionCreateFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

const PRESET_COLORS = [
  { value: '#06b6d4', label: 'Cyan',   ring: 'ring-cyan-500' },
  { value: '#3b82f6', label: 'Blue',   ring: 'ring-blue-500' },
  { value: '#a855f7', label: 'Purple', ring: 'ring-purple-500' },
  { value: '#22c55e', label: 'Green',  ring: 'ring-green-500' },
  { value: '#f59e0b', label: 'Amber',  ring: 'ring-amber-500' },
  { value: '#f43f5e', label: 'Rose',   ring: 'ring-rose-500' },
];

export function MissionCreateForm({ onCreated, onCancel }: MissionCreateFormProps) {
  const [db] = useDatabase();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0].value);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleAgent(id: string) {
    setSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!db) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await db.missions.insert({
        id: crypto.randomUUID(),
        title: trimmed,
        description: description.trim() || undefined,
        status: 'active',
        color,
        assigned_agents: selectedAgentIds,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      onCreated();
    } catch (err) {
      console.error('[MissionCreateForm] insert failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to create mission.');
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-800 border border-white/10 rounded-xl p-4 space-y-4"
    >
      <h3 className="text-sm font-semibold text-white">New Mission</h3>

      {/* Title */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Mission name..."
          className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Optional description..."
          className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-colors resize-none"
        />
      </div>

      {/* Color picker */}
      <div>
        <label className="block text-xs text-slate-400 mb-2">Color</label>
        <div className="flex gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              title={c.label}
              className={[
                'w-6 h-6 rounded-full transition-all duration-150',
                color === c.value ? `ring-2 ring-offset-2 ring-offset-slate-800 ${c.ring}` : 'opacity-70 hover:opacity-100',
              ].join(' ')}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
      </div>

      {/* Agent multi-select */}
      <div>
        <label className="block text-xs text-slate-400 mb-2">Assign Agents</label>
        <div className="grid grid-cols-2 gap-1">
          {AGENTS.map((agent) => {
            const checked = selectedAgentIds.includes(agent.id);
            return (
              <label
                key={agent.id}
                className={[
                  'flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-xs',
                  checked
                    ? 'bg-cyan-500/10 border border-cyan-500/30 text-white'
                    : 'bg-slate-900/50 border border-transparent text-slate-300 hover:bg-slate-900',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleAgent(agent.id)}
                  className="sr-only"
                />
                <span>{agent.emoji}</span>
                <span className="truncate">{agent.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="text-xs text-rose-400">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-semibold text-white transition-colors"
        >
          {saving ? 'Creating…' : 'Create Mission'}
        </button>
      </div>
    </form>
  );
}
