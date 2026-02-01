import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useSidebarStore } from './SidebarStore';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/tasks': 'Tasks',
  '/calendar': 'Calendar',
  '/email': 'Email',
  '/life': 'Wheel of Life',
  '/journal': 'Journal',
  '/projects': 'Projects',
};

export function TopBar() {
  const location = useLocation();
  const { setMobileOpen } = useSidebarStore();
  const title = PAGE_TITLES[location.pathname] ?? 'Titan';

  return (
    <header className="glass-topbar h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors md:hidden"
        >
          <Menu className="w-5 h-5" style={{ strokeWidth: 1.5 }} />
        </button>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
    </header>
  );
}
