import { EmailDashboard } from '../components/EmailDashboard';
import { useDatabase } from '../hooks/useDatabase';
import { useSnoozedEmailTimer } from '../hooks/useSnoozedEmailTimer';

export default function EmailPage() {
  const [db] = useDatabase();
  useSnoozedEmailTimer(db);

  return (
    <div className="animate-fade-up">
      <div className="glass-card p-4 sm:p-6 min-h-[60vh]">
        <EmailDashboard />
      </div>
    </div>
  );
}
