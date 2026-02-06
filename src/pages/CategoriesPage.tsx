import { CategoryManager } from '../components/CategoryManager';

export default function CategoriesPage() {
  return (
    <div className="animate-fade-up">
      <div className="glass-card p-4 sm:p-6 min-h-[80vh]">
        <CategoryManager />
      </div>
    </div>
  );
}
