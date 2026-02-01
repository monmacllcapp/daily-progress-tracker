import { JournalHistory } from '../components/JournalHistory';

export default function JournalPage() {
  return (
    <div className="animate-fade-up">
      <div className="glass-card p-4 sm:p-6 min-h-[60vh]">
        <JournalHistory />
      </div>
    </div>
  );
}
