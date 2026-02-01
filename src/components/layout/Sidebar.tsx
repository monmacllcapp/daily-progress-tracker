import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  Mail,
  Target,
  BookOpen,
  Image,
  Sun,
  PanelLeftClose,
  PanelLeft,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSidebarStore } from './SidebarStore';

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

const mainNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Tasks', icon: CheckSquare, path: '/tasks' },
  { label: 'Calendar', icon: Calendar, path: '/calendar' },
  { label: 'Email', icon: Mail, path: '/email' },
];

const lifeNav: NavItem[] = [
  { label: 'Wheel of Life', icon: Target, path: '/life' },
  { label: 'Journal', icon: BookOpen, path: '/journal' },
  { label: 'Projects', icon: Image, path: '/projects' },
];

const flowNav: NavItem[] = [
  { label: 'Morning Flow', icon: Sun, path: '/morning' },
];

function NavGroup({
  label,
  items,
  collapsed,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div>
      {!collapsed && (
        <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {items.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                onNavigate?.();
              }}
              className={clsx(
                'relative flex items-center gap-3 w-full rounded-xl transition-all duration-200',
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5',
                isActive
                  ? 'nav-item-active'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              )}
              title={collapsed ? item.label : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-blue-400 to-purple-500"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <Icon className="w-5 h-5 shrink-0" style={{ strokeWidth: 1.5 }} />
              {!collapsed && (
                <span className="text-sm font-medium truncate">{item.label}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar() {
  const { isCollapsed, isMobileOpen, toggleCollapsed, setMobileOpen } =
    useSidebarStore();

  const sidebarContent = (collapsed: boolean, onNavigate?: () => void) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div
        className={clsx(
          'flex items-center h-16 border-b border-white/5 shrink-0',
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        )}
      >
        {!collapsed && (
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-rose-400 bg-clip-text text-transparent">
            Titan
          </h1>
        )}
        <button
          onClick={collapsed ? toggleCollapsed : toggleCollapsed}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors lg:block hidden"
        >
          {collapsed ? (
            <PanelLeft className="w-5 h-5" style={{ strokeWidth: 1.5 }} />
          ) : (
            <PanelLeftClose className="w-5 h-5" style={{ strokeWidth: 1.5 }} />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-4 space-y-6">
        <NavGroup label="Main" items={mainNav} collapsed={collapsed} onNavigate={onNavigate} />
        <div className="border-t border-white/5" />
        <NavGroup label="Life" items={lifeNav} collapsed={collapsed} onNavigate={onNavigate} />
        <div className="border-t border-white/5" />
        <NavGroup label="Flow" items={flowNav} collapsed={collapsed} onNavigate={onNavigate} />
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          'hidden lg:flex flex-col glass-sidebar h-screen sticky top-0 z-30 shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {sidebarContent(isCollapsed)}
      </aside>

      {/* Tablet sidebar (collapsed by default) */}
      <aside className="hidden md:flex lg:hidden flex-col glass-sidebar h-screen sticky top-0 z-30 w-16 shrink-0">
        {sidebarContent(true)}
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-64 glass-sidebar z-50 md:hidden"
            >
              <div className="absolute top-4 right-3">
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {sidebarContent(false, () => setMobileOpen(false))}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
