import { useState, useCallback } from 'react';
import { Plus, X, Building2, Trash2, Edit3, DollarSign } from 'lucide-react';
import { DealAnalyzer } from '../components/v2/DealAnalyzer';
import { SignalFeed } from '../components/v2/SignalFeed';
import { useSignalStore } from '../store/signalStore';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';
import type { Deal } from '../types/signals';

type DealStrategy = 'flip' | 'brrrr' | 'rental' | 'wholesale';
type DealStatus = 'prospect' | 'analyzing' | 'offer' | 'under_contract' | 'closed' | 'dead';

const STRATEGIES: DealStrategy[] = ['flip', 'brrrr', 'rental', 'wholesale'];
const STATUSES: DealStatus[] = ['prospect', 'analyzing', 'offer', 'under_contract', 'closed', 'dead'];

interface DealFormData {
  address: string;
  city: string;
  state: string;
  zip: string;
  strategy: DealStrategy;
  status: DealStatus;
  purchase_price: string;
  arv: string;
  rehab_cost: string;
  notes: string;
}

const emptyForm: DealFormData = {
  address: '', city: '', state: '', zip: '',
  strategy: 'flip', status: 'prospect',
  purchase_price: '', arv: '', rehab_cost: '', notes: '',
};

export default function DealsPage() {
  const [db] = useDatabase();
  const [deals] = useRxQuery<Deal>(db?.deals, { sort: [{ created_at: 'desc' }] });
  const signals = useSignalStore(s => s.signals);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DealFormData>(emptyForm);

  const now = new Date().toISOString();
  const reSignals = signals.filter(s =>
    !s.is_dismissed && (!s.expires_at || s.expires_at > now) && s.domain === 'business_re'
  );

  const resetForm = useCallback(() => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }, []);

  const handleEdit = useCallback((deal: Deal) => {
    setForm({
      address: deal.address,
      city: deal.city || '',
      state: deal.state || '',
      zip: deal.zip || '',
      strategy: deal.strategy as DealStrategy,
      status: deal.status as DealStatus,
      purchase_price: deal.purchase_price?.toString() || '',
      arv: deal.arv?.toString() || '',
      rehab_cost: deal.rehab_cost?.toString() || '',
      notes: deal.notes || '',
    });
    setEditingId(deal.id);
    setShowForm(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!db || !form.address.trim()) return;
    const ts = new Date().toISOString();

    const doc: Record<string, unknown> = {
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      zip: form.zip.trim(),
      strategy: form.strategy,
      status: form.status,
      purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : undefined,
      arv: form.arv ? parseFloat(form.arv) : undefined,
      rehab_cost: form.rehab_cost ? parseFloat(form.rehab_cost) : undefined,
      notes: form.notes.trim() || undefined,
      linked_email_ids: [],
      linked_task_ids: [],
      updated_at: ts,
    };

    if (editingId) {
      doc.id = editingId;
      await db.deals.upsert(doc);
    } else {
      doc.id = crypto.randomUUID();
      doc.created_at = ts;
      await db.deals.insert(doc);
    }
    resetForm();
  }, [db, form, editingId, resetForm]);

  const handleDelete = useCallback(async (id: string) => {
    if (!db) return;
    const doc = await db.deals.findOne(id).exec();
    if (doc) await doc.remove();
  }, [db]);

  const setField = (key: keyof DealFormData, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6 animate-fade-up">
      {/* RE Domain Signals */}
      {reSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Deal Signals
          </div>
          <SignalFeed filterDomain="business_re" maxSignals={5} />
        </div>
      )}

      {/* Add Deal Button */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Building2 className="w-5 h-5 text-emerald-400" />
          Deal Pipeline
        </h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-medium rounded-lg hover:bg-emerald-500/30 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Deal
        </button>
      </div>

      {/* Deal Form */}
      {showForm && (
        <div className="bg-slate-900/50 border border-emerald-500/20 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              {editingId ? 'Edit Deal' : 'New Deal'}
            </h3>
            <button onClick={resetForm} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Address *</label>
              <input
                value={form.address}
                onChange={e => setField('address', e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                placeholder="123 Main St"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">City</label>
              <input
                value={form.city}
                onChange={e => setField('city', e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                placeholder="City"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">State</label>
                <input
                  value={form.state}
                  onChange={e => setField('state', e.target.value)}
                  className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  placeholder="TX"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Zip</label>
                <input
                  value={form.zip}
                  onChange={e => setField('zip', e.target.value)}
                  className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  placeholder="75001"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Strategy</label>
              <select
                value={form.strategy}
                onChange={e => setField('strategy', e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              >
                {STRATEGIES.map(s => (
                  <option key={s} value={s} className="bg-slate-800">{s.toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Status</label>
              <select
                value={form.status}
                onChange={e => setField('status', e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              >
                {STATUSES.map(s => (
                  <option key={s} value={s} className="bg-slate-800">
                    {s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Purchase Price</label>
              <input
                type="number"
                value={form.purchase_price}
                onChange={e => setField('purchase_price', e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                placeholder="150000"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">ARV</label>
              <input
                type="number"
                value={form.arv}
                onChange={e => setField('arv', e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                placeholder="220000"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Rehab Cost</label>
              <input
                type="number"
                value={form.rehab_cost}
                onChange={e => setField('rehab_cost', e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                placeholder="45000"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                rows={2}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 resize-none"
                placeholder="Deal notes..."
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
              disabled={!form.address.trim()}
              className="px-4 py-1.5 text-sm font-medium bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-40"
            >
              {editingId ? 'Update' : 'Add Deal'}
            </button>
          </div>
        </div>
      )}

      {/* Deal Pipeline Display */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl">
        <DealAnalyzer deals={deals} signals={reSignals} />
      </div>

      {/* Full deal list with edit/delete */}
      {deals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            All Deals ({deals.length})
          </div>
          <div className="divide-y divide-white/5">
            {deals.map(deal => (
              <div key={deal.id} className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{deal.address}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${
                      deal.status === 'under_contract' ? 'bg-emerald-500/20 text-emerald-400' :
                      deal.status === 'offer' ? 'bg-amber-500/20 text-amber-400' :
                      deal.status === 'analyzing' ? 'bg-blue-500/20 text-blue-400' :
                      deal.status === 'closed' ? 'bg-purple-500/20 text-purple-400' :
                      deal.status === 'dead' ? 'bg-red-500/20 text-red-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {deal.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-500 mt-0.5">
                    {deal.city && <span>{deal.city}, {deal.state}</span>}
                    <span className="capitalize">{deal.strategy}</span>
                    {deal.purchase_price && (
                      <span className="flex items-center gap-0.5">
                        <DollarSign className="w-3 h-3" />
                        {deal.purchase_price.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleEdit(deal)}
                  className="p-1.5 text-slate-500 hover:text-blue-400 transition-colors"
                  title="Edit"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(deal.id)}
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
