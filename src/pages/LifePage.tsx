import { WheelOfLife } from '../components/WheelOfLife';
import { CategoryManager } from '../components/CategoryManager';
import { VisionBoardGallery } from '../components/VisionBoardGallery';

export default function LifePage() {
  return (
    <div className="animate-fade-up space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-4 sm:p-6">
          <WheelOfLife />
        </div>
        <div className="glass-card p-4 sm:p-6">
          <CategoryManager />
        </div>
      </div>
      <div className="glass-card p-4 sm:p-6">
        <VisionBoardGallery />
      </div>
    </div>
  );
}
