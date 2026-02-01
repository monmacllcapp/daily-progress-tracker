import { DailyAgenda } from '../components/DailyAgenda';

export default function CalendarPage() {
  return (
    <div className="animate-fade-up">
      <div className="glass-card p-4 sm:p-6 min-h-[60vh]">
        <DailyAgenda />
      </div>
    </div>
  );
}
