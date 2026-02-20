import { VisionBoardGallery } from '../components/VisionBoardGallery';

export default function VisionPage() {
  return (
    <div className="animate-fade-up">
      <div className="glass-card p-4 sm:p-6 min-h-[80vh]">
        <VisionBoardGallery />
      </div>
    </div>
  );
}
