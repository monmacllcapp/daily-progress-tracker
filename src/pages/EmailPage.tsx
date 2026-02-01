import { EmailDashboard } from '../components/EmailDashboard';

export default function EmailPage() {
  return (
    <div className="animate-fade-up">
      <div className="glass-card p-4 sm:p-6 min-h-[60vh]">
        <EmailDashboard />
      </div>
    </div>
  );
}
