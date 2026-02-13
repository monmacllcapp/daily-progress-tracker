import { StaffingDashboard } from '../components/StaffingDashboard';

export default function StaffingPage() {
  return (
    <div className="animate-fade-up">
      <div className="glass-card p-4 sm:p-6 min-h-[80vh]">
        <StaffingDashboard pageMode />
      </div>
    </div>
  );
}
