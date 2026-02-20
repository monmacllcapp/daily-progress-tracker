import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useSidebarStore } from './SidebarStore';
import { LevelBadge } from '../LevelBadge';
import { SoundwaveAnimation } from '../SoundwaveAnimation';
import { useJarvisStore } from '../../store/jarvisStore';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/tasks': 'Tasks',
  '/calendar': 'Calendar',
  '/email': 'Email',
  '/life': 'Wheel of Life',
  '/journal': 'Journal',
  '/projects': 'Projects',
  '/command-center': 'Command Center',
  '/deals': 'Deals Pipeline',
  '/trading': 'Trading Dashboard',
  '/family': 'Family Hub',
  '/finance': 'Financial Overview',
  '/morning': 'Morning Flow',
  '/staffing': 'Staffing KPIs',
  '/categories': 'Life Categories',
  '/vision': 'Vision Board',
  '/dev-projects': 'Dev Intelligence',
};

export function TopBar() {
  const location = useLocation();
  const { setMobileOpen } = useSidebarStore();
  const title = PAGE_TITLES[location.pathname] ?? 'Maple';
  const voiceMode = useJarvisStore((s) => s.voiceMode);
  const isOpen = useJarvisStore((s) => s.isOpen);
  const setIsOpen = useJarvisStore((s) => s.setIsOpen);

  const isActive = voiceMode !== 'idle';

  return (
    <header className="glass-topbar h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20 shrink-0">
      {/* Left: page title */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors md:hidden"
        >
          <Menu className="w-5 h-5" style={{ strokeWidth: 1.5 }} />
        </button>
        <h2 className="text-lg font-semibold text-white truncate">{title}</h2>
      </div>

      {/* Center: Maple branding */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/20 transition-all group cursor-pointer"
      >
        <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-shadow ${
          isActive
            ? 'bg-gradient-to-br from-cyan-500 to-blue-600 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
            : 'bg-gradient-to-br from-cyan-600/60 to-blue-700/60 group-hover:from-cyan-500/80 group-hover:to-blue-600/80'
        }`}>
          <SoundwaveAnimation active={isActive} size="sm" />
        </div>
        <span className="text-xs font-bold tracking-widest uppercase text-slate-300 group-hover:text-white transition-colors hidden sm:inline">
          Maple
        </span>
        {isActive && (
          <span className="text-[11px] text-cyan-400 hidden sm:inline">
            {voiceMode === 'listening' ? 'Listening' : voiceMode === 'processing' ? 'Thinking' : 'Speaking'}
          </span>
        )}
      </button>

      {/* Right: level badge */}
      <div className="flex items-center justify-end flex-1">
        <LevelBadge />
      </div>
    </header>
  );
}
