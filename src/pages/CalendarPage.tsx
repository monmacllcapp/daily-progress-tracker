import { useState } from 'react';
import { DailyAgenda } from '../components/DailyAgenda';
import { WeekView } from '../components/calendar/WeekView';
import { MonthView } from '../components/calendar/MonthView';
import { useSignalStore } from '../store/signalStore';

type CalendarView = 'day' | 'week' | 'month';

export default function CalendarPage() {
  const signals = useSignalStore(s => s.signals);
  const [activeView, setActiveView] = useState<CalendarView>('week');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const now = new Date().toISOString();
  const calendarSignals = signals.filter(s =>
    !s.is_dismissed && (!s.expires_at || s.expires_at > now) &&
    (s.type === 'calendar_conflict' || s.type === 'context_switch_prep')
  );

  // Clicking a date in MonthView or WeekView switches to Day view for that date
  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
    setActiveView('day');
  };

  return (
    <div className="animate-fade-up space-y-6">
      {/* Calendar Signals */}
      {calendarSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Calendar Alerts
          </div>
          <div className="p-3 space-y-2">
            {calendarSignals.slice(0, 5).map(signal => (
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

      {/* View Tabs */}
      <div className="flex items-center gap-1 bg-slate-900/50 rounded-lg p-1 w-fit">
        {(['day', 'week', 'month'] as const).map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              activeView === view
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {view}
          </button>
        ))}
      </div>

      <div className="glass-card p-4 sm:p-6 min-h-[60vh]">
        {activeView === 'day' && (
          <DailyAgenda selectedDate={selectedDate} onDateChange={(d) => setSelectedDate(d)} />
        )}
        {activeView === 'week' && (
          <WeekView selectedDate={selectedDate} onDateChange={handleDateChange} />
        )}
        {activeView === 'month' && (
          <MonthView selectedDate={selectedDate} onDateChange={handleDateChange} />
        )}
      </div>
    </div>
  );
}
