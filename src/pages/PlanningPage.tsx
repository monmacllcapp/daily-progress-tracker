import { useState, useMemo, useEffect } from 'react';
import { CalendarDays, CalendarRange, Clock, Target, TrendingUp } from 'lucide-react';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';
import type { Task } from '../types/schema';
import type { CalendarEvent } from '../types/schema';
import type { MeetingLoadStats } from '../services/calendar-monitor';
import type { FreeSlot } from '../services/calendar-ai';

function isMonday() {
  return new Date().getDay() === 1;
}

function getWeekDateRange(): string {
  const today = new Date();
  const monday = new Date(today);
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function getWeekNumber(): number {
  const today = new Date();
  const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
  const pastDaysOfYear = (today.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

export default function PlanningPage() {
  const [mode, setMode] = useState<'daily' | 'weekly'>(isMonday() ? 'weekly' : 'daily');
  const [db] = useDatabase();

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">
            {mode === 'weekly' ? 'Weekly Planning' : 'Daily Planning'}
          </h1>
          {isMonday() && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
              Monday
            </span>
          )}
        </div>
        <div className="flex bg-white/5 border border-white/10 rounded-lg p-1">
          <button
            onClick={() => setMode('daily')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'daily'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            Daily
          </button>
          <button
            onClick={() => setMode('weekly')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'weekly'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CalendarRange className="w-4 h-4" />
            Weekly
          </button>
        </div>
      </div>

      {mode === 'daily' ? <DailyPlanView db={db} /> : <WeeklyPlanView db={db} />}
    </div>
  );
}

interface PlanViewProps {
  db: any;
}

function DailyPlanView({ db }: PlanViewProps) {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const [tasks] = useRxQuery<Task>(db?.tasks, {
    selector: { status: 'active' },
    sort: [{ priority: 'desc' }],
  });

  const [meetingLoad, setMeetingLoad] = useState<MeetingLoadStats | null>(null);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[]>([]);
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!db) return;

    const loadCalendarData = async () => {
      setIsLoading(true);
      try {
        const { isGoogleConnected } = await import('../services/google-auth');
        if (!isGoogleConnected()) {
          setIsCalendarConnected(false);
          setIsLoading(false);
          return;
        }
        setIsCalendarConnected(true);

        const { getMeetingLoadStats } = await import('../services/calendar-monitor');
        const { computeFreeSlots } = await import('../services/calendar-ai');

        const dayStart = new Date(today);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(today);
        dayEnd.setHours(23, 59, 59, 999);

        const docs = await db.calendar_events.find({
          selector: {
            start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() }
          }
        }).exec();
        const events = docs.map((d: any) => d.toJSON() as CalendarEvent);

        const load = await getMeetingLoadStats(db, today);
        setMeetingLoad(load);

        const slots = computeFreeSlots(events, today);
        setFreeSlots(slots);
      } catch (err) {
        console.error('[PlanningPage] Calendar load failed:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadCalendarData();
  }, [db, today]);

  const priorityGroups = useMemo(() => {
    const groups: Record<string, Task[]> = {
      urgent: [],
      high: [],
      medium: [],
      low: [],
    };

    tasks.forEach(task => {
      groups[task.priority]?.push(task);
    });

    return groups;
  }, [tasks]);

  const priorityConfig = {
    urgent: { label: 'Urgent', color: 'red', bgClass: 'bg-red-500/10', borderClass: 'border-red-500/20', textClass: 'text-red-300' },
    high: { label: 'High', color: 'orange', bgClass: 'bg-orange-500/10', borderClass: 'border-orange-500/20', textClass: 'text-orange-300' },
    medium: { label: 'Medium', color: 'yellow', bgClass: 'bg-yellow-500/10', borderClass: 'border-yellow-500/20', textClass: 'text-yellow-300' },
    low: { label: 'Low', color: 'slate', bgClass: 'bg-slate-500/10', borderClass: 'border-slate-500/20', textClass: 'text-slate-300' },
  };

  return (
    <div className="space-y-6">
      {/* Date Header */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white">{todayStr}</h2>
      </div>

      {/* Calendar Summary Card */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-blue-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Calendar Summary
          </h3>
        </div>

        {isLoading ? (
          <p className="text-slate-400 text-sm">Loading calendar data...</p>
        ) : !isCalendarConnected ? (
          <div className="text-center py-4">
            <p className="text-slate-400 text-sm mb-2">Connect your Google Calendar to see your schedule</p>
            <button className="text-blue-400 hover:text-blue-300 text-sm font-medium">
              Connect Calendar
            </button>
          </div>
        ) : meetingLoad ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-2xl font-bold text-white">{meetingLoad.meetingCount}</p>
                <p className="text-xs text-slate-400">Meetings</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{Math.round(meetingLoad.totalFreeMinutes / 60 * 10) / 10}h</p>
                <p className="text-xs text-slate-400">Free Time</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{meetingLoad.percentBooked}%</p>
                <p className="text-xs text-slate-400">Booked</p>
              </div>
            </div>

            {/* Percentage booked bar */}
            <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                style={{ width: `${meetingLoad.percentBooked}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-slate-400 text-sm">No calendar data available</p>
        )}
      </div>

      {/* Active Tasks Section */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-blue-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Today's Tasks
          </h3>
          <span className="ml-auto text-sm font-medium text-slate-300">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        {tasks.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">No active tasks</p>
        ) : (
          <div className="space-y-3">
            {(['urgent', 'high', 'medium', 'low'] as const).map(priority => {
              const group = priorityGroups[priority];
              if (group.length === 0) return null;

              const config = priorityConfig[priority];

              return (
                <div key={priority} className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {config.label} ({group.length})
                  </p>
                  {group.map(task => (
                    <div
                      key={task.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${config.bgClass} ${config.borderClass}`}
                    >
                      <div className="flex-1">
                        <p className={`font-medium ${config.textClass}`}>{task.title}</p>
                        {task.due_date && (
                          <p className="text-xs text-slate-400 mt-1">
                            Due: {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${config.bgClass} ${config.textClass}`}>
                        {config.label}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Focus Blocks Section */}
      {isCalendarConnected && freeSlots.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Focus Blocks
            </h3>
          </div>

          <div className="space-y-2">
            {freeSlots.map((slot, idx) => {
              const startTime = new Date(slot.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              const endTime = new Date(slot.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

              return (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <Clock className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-300">
                      {startTime} - {endTime}
                    </p>
                    <p className="text-xs text-slate-400">{slot.durationMinutes} min • {slot.recommendation}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function WeeklyPlanView({ db }: PlanViewProps) {
  const weekRange = getWeekDateRange();
  const weekNumber = getWeekNumber();

  const [weeklyGoals, setWeeklyGoals] = useState<string[]>(['', '', '']);

  // Load weekly goals from localStorage
  useEffect(() => {
    const key = `weekly_goals_${weekNumber}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setWeeklyGoals(parsed);
        }
      } catch (err) {
        console.error('[PlanningPage] Failed to parse weekly goals:', err);
      }
    }
  }, [weekNumber]);

  // Save weekly goals to localStorage
  const saveWeeklyGoals = (goals: string[]) => {
    const key = `weekly_goals_${weekNumber}`;
    localStorage.setItem(key, JSON.stringify(goals));
    setWeeklyGoals(goals);
  };

  const updateGoal = (index: number, value: string) => {
    const newGoals = [...weeklyGoals];
    newGoals[index] = value;
    saveWeeklyGoals(newGoals);
  };

  // Last week stats
  const [lastWeekStats, setLastWeekStats] = useState<{ completed: number; streakCount: number }>({
    completed: 0,
    streakCount: 0,
  });

  useEffect(() => {
    if (!db) return;

    const loadLastWeekStats = async () => {
      try {
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);

        const docs = await db.tasks.find({
          selector: {
            status: 'completed',
            completed_date: { $gte: sevenDaysAgo.toISOString() }
          }
        }).exec();

        const categoryDocs = await db.categories.find().exec();
        const categories = categoryDocs.map((d: any) => d.toJSON());
        const activeStreaks = categories.filter((c: any) => c.streak_count > 0).length;

        setLastWeekStats({
          completed: docs.length,
          streakCount: activeStreaks,
        });
      } catch (err) {
        console.error('[PlanningPage] Failed to load last week stats:', err);
      }
    };

    loadLastWeekStats();
  }, [db]);

  // Week ahead calendar data
  const [weekCalendarData, setWeekCalendarData] = useState<Array<{ day: string; meetings: number; freeHours: number }>>([]);
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);

  useEffect(() => {
    if (!db) return;

    const loadWeekCalendarData = async () => {
      try {
        const { isGoogleConnected } = await import('../services/google-auth');
        if (!isGoogleConnected()) {
          setIsCalendarConnected(false);
          return;
        }
        setIsCalendarConnected(true);

        const { getMeetingLoadStats } = await import('../services/calendar-monitor');

        const today = new Date();
        const monday = new Date(today);
        const dayOfWeek = today.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        monday.setDate(today.getDate() + diff);

        const weekData: Array<{ day: string; meetings: number; freeHours: number }> = [];

        for (let i = 0; i < 7; i++) {
          const day = new Date(monday);
          day.setDate(monday.getDate() + i);

          const load = await getMeetingLoadStats(db, day);
          weekData.push({
            day: day.toLocaleDateString('en-US', { weekday: 'short' }),
            meetings: load.meetingCount,
            freeHours: Math.round(load.totalFreeMinutes / 60 * 10) / 10,
          });
        }

        setWeekCalendarData(weekData);
      } catch (err) {
        console.error('[PlanningPage] Failed to load week calendar data:', err);
      }
    };

    loadWeekCalendarData();
  }, [db]);

  return (
    <div className="space-y-6">
      {/* Week Overview */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white">{weekRange}</h2>
        <p className="text-sm text-slate-400 mt-1">Week {weekNumber}</p>
      </div>

      {/* Last Week Stats */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
          Last Week Performance
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-3xl font-bold text-white">{lastWeekStats.completed}</p>
            <p className="text-sm text-slate-400">Tasks Completed</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white">{lastWeekStats.streakCount}</p>
            <p className="text-sm text-slate-400">Active Streaks</p>
          </div>
        </div>
      </div>

      {/* Weekly Goals */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
          Weekly Goals
        </h3>
        <div className="space-y-3">
          {weeklyGoals.map((goal, idx) => (
            <div key={idx}>
              <input
                type="text"
                value={goal}
                onChange={(e) => updateGoal(idx, e.target.value)}
                placeholder={`Goal ${idx + 1}`}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Week Ahead Calendar */}
      {isCalendarConnected && weekCalendarData.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Week Ahead
          </h3>
          <div className="space-y-2">
            {weekCalendarData.map((dayData, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                <span className="text-sm font-medium text-white">{dayData.day}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-slate-400">
                    {dayData.meetings} {dayData.meetings === 1 ? 'meeting' : 'meetings'}
                  </span>
                  <span className="text-green-400 font-medium">
                    {dayData.freeHours}h free
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
