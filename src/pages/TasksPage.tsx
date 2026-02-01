import { TaskDashboard } from '../components/TaskDashboard';
import { BrainDump } from '../components/BrainDump';

export default function TasksPage() {
  return (
    <div className="animate-fade-up space-y-6">
      <BrainDump />
      <div className="glass-card p-4 sm:p-6 min-h-[60vh]">
        <TaskDashboard />
      </div>
    </div>
  );
}
