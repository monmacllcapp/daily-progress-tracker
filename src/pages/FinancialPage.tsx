import { FinancialDashboard } from '../components/FinancialDashboard';

export default function FinancialPage() {
  return (
    <div className="animate-fade-up">
      <div className="glass-card p-4 sm:p-6 min-h-[80vh]">
        <FinancialDashboard pageMode />
      </div>
    </div>
  );
}
