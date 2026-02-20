import { useState, useCallback, useMemo } from 'react';
import { Plus, X, Heart, Trash2, Edit3, Users, Calendar } from 'lucide-react';
import { FamilyHub } from '../components/v2/FamilyHub';
import { SignalFeed } from '../components/v2/SignalFeed';
import { useSignalStore } from '../store/signalStore';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';
import type { FamilyEvent } from '../types/signals';

interface EventFormData {
  member: string;
  summary: string;
  date: string;
  start_time: string;
  end_time: string;
}

const emptyForm: EventFormData = {
  member: '', summary: '', date: '', start_time: '09:00', end_time: '10:00',
};

export default function FamilyPage() {
  const [db] = useDatabase();
  const [events] = useRxQuery<FamilyEvent>(db?.family_events, { sort: [{ start_time: 'desc' }] });
  const signals = useSignalStore(s => s.signals);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormData>({ ...emptyForm, date: new Date().toISOString().split('T')[0] });

  const now = new Date().toISOString();
  const familySignals = signals.filter(s =>
    !s.is_dismissed && (!s.expires_at || s.expires_at > now) && s.domain === 'family'
  );

  // Split events into today and upcoming
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayEvents = useMemo(() =>
    events.filter(e => e.start_time.startsWith(todayStr)),
    [events, todayStr]
  );

  const resetForm = useCallback(() => {
    setForm({ ...emptyForm, date: new Date().toISOString().split('T')[0] });
    setEditingId(null);
    setShowForm(false);
  }, []);

  const handleEdit = useCallback((event: FamilyEvent) => {
    const startDate = event.start_time.split('T')[0];
    const startTime = event.start_time.includes('T')
      ? event.start_time.split('T')[1].substring(0, 5)
      : '09:00';
    const endTime = event.end_time.includes('T')
      ? event.end_time.split('T')[1].substring(0, 5)
      : '10:00';

    setForm({
      member: event.member,
      summary: event.summary,
      date: startDate,
      start_time: startTime,
      end_time: endTime,
    });
    setEditingId(event.id);
    setShowForm(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!db || !form.member.trim() || !form.summary.trim()) return;
    const ts = new Date().toISOString();
    const startISO = `${form.date}T${form.start_time}:00`;
    const endISO = `${form.date}T${form.end_time}:00`;

    const doc: Record<string, unknown> = {
      member: form.member.trim(),
      summary: form.summary.trim(),
      start_time: startISO,
      end_time: endISO,
      source_calendar: 'manual',
      updated_at: ts,
    };

    if (editingId) {
      doc.id = editingId;
      await db.family_events.upsert(doc);
    } else {
      doc.id = crypto.randomUUID();
      doc.created_at = ts;
      await db.family_events.insert(doc);
    }
    resetForm();
  }, [db, form, editingId, resetForm]);

  const handleDelete = useCallback(async (id: string) => {
    if (!db) return;
    const doc = await db.family_events.findOne(id).exec();
    if (doc) await doc.remove();
  }, [db]);

  const setField = (key: keyof EventFormData, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const formatDate = (iso: string) => {
    try {
      const d = iso.split('T')[0];
      if (d === todayStr) return 'Today';
      return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      });
    } catch { return iso; }
  };

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

      {/* Header + Add */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Heart className="w-5 h-5 text-pink-400" />
          Family
        </h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-500/20 text-pink-400 text-sm font-medium rounded-lg hover:bg-pink-500/30 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Event
        </button>
      </div>

      {/* Event Form */}
      {showForm && (
        <div className="bg-slate-900/50 border border-pink-500/20 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              {editingId ? 'Edit Event' : 'New Family Event'}
            </h3>
            <button onClick={resetForm} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Family Member *</label>
              <input
                value={form.member}
                onChange={e => setField('member', e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50"
                placeholder="e.g. Emma, Dad"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setField('date', e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500/50"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Event *</label>
              <input
                value={form.summary}
                onChange={e => setField('summary', e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50"
                placeholder="Soccer practice, Doctor appointment..."
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Start Time</label>
              <input
                type="time"
                value={form.start_time}
                onChange={e => setField('start_time', e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">End Time</label>
              <input
                type="time"
                value={form.end_time}
                onChange={e => setField('end_time', e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500/50"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.member.trim() || !form.summary.trim()}
              className="px-4 py-1.5 text-sm font-medium bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors disabled:opacity-40"
            >
              {editingId ? 'Update' : 'Add Event'}
            </button>
          </div>
        </div>
      )}

      {/* Today's Events via FamilyHub */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl">
        <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Today's Family Schedule
        </div>
        <FamilyHub events={todayEvents} signals={familySignals} />
      </div>

      {/* All Events List */}
      {events.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            All Events ({events.length})
          </div>
          <div className="divide-y divide-white/5">
            {events.map(event => (
              <div key={event.id} className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-white">{event.member}</span>
                    <span className="text-xs text-slate-500">{formatDate(event.start_time)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                    <Calendar className="w-3 h-3" />
                    <span>{event.summary}</span>
                    <span className="text-slate-600">
                      {formatTime(event.start_time)} - {formatTime(event.end_time)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleEdit(event)}
                  className="p-1.5 text-slate-500 hover:text-blue-400 transition-colors"
                  title="Edit"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(event.id)}
                  className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
