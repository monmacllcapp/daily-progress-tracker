import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { clsx } from 'clsx';
import { getIconComponent } from '../../config/iconRegistry';
import type { NavItem } from '../../types/sidebar';

interface SortableNavItemProps {
  item: NavItem;
  collapsed: boolean;
  editMode: boolean;
  onNavigate?: () => void;
}

export function SortableNavItem({ item, collapsed, editMode, onNavigate }: SortableNavItemProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = location.pathname === item.path;
  const Icon = getIconComponent(item.iconName);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: !editMode,
  });

  const style = editMode
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <button
        onClick={() => {
          if (!isDragging) {
            navigate(item.path);
            onNavigate?.();
          }
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
        {/* Active indicator */}
        {isActive && (
          <motion.div
            layoutId="sidebar-active"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-blue-400 to-purple-500"
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          />
        )}

        {/* Drag handle — only in edit mode, not collapsed */}
        {editMode && !collapsed && (
          <span
            className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing shrink-0 -ml-1"
            {...listeners}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}

        <Icon className="w-5 h-5 shrink-0" style={{ strokeWidth: 1.5 }} />

        {!collapsed && (
          <span className="text-sm font-medium truncate">{item.label}</span>
        )}
      </button>
    </div>
  );
}
