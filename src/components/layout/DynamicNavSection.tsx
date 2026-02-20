import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronRight, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useSidebarStore } from './SidebarStore';
import { SortableNavItem } from './SortableNavItem';
import type { NavItem, NavSection } from '../../types/sidebar';

interface DynamicNavSectionProps {
  section: NavSection;
  items: NavItem[];
  collapsed: boolean;   // sidebar collapsed (icon-only mode)
  editMode: boolean;
  onNavigate?: () => void;
}

export function DynamicNavSection({ section, items, collapsed, editMode, onNavigate }: DynamicNavSectionProps) {
  const { toggleSectionCollapse, updateSectionTitle, deleteSection } = useSidebarStore();
  const [isEditing, setIsEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Make this section a droppable target for cross-section DnD
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: section.id,
  });

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== section.title) {
      updateSectionTitle(section.id, trimmed);
    } else {
      setTitleDraft(section.title);
    }
    setIsEditing(false);
  };

  // When sidebar is collapsed, don't show section headers
  if (collapsed) {
    return (
      <div className="space-y-1">
        {!section.isCollapsed && items.map((item) => (
          <SortableNavItem
            key={item.id}
            item={item}
            collapsed={collapsed}
            editMode={false}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    );
  }

  return (
    <div ref={setDropRef}>
      {/* Section header */}
      <div className="flex items-center gap-1 px-2 mb-1 group">
        <button
          onClick={() => toggleSectionCollapse(section.id)}
          className="p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <ChevronRight
            className={clsx(
              'w-3.5 h-3.5 transition-transform duration-200',
              !section.isCollapsed && 'rotate-90'
            )}
            style={{ strokeWidth: 1.5 }}
          />
        </button>

        {isEditing ? (
          <input
            ref={inputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') {
                setTitleDraft(section.title);
                setIsEditing(false);
              }
            }}
            className="flex-1 bg-transparent text-xs uppercase tracking-widest text-slate-300 font-semibold border-b border-blue-400 outline-none px-1 py-0"
          />
        ) : (
          <span
            className="flex-1 text-xs uppercase tracking-widest text-slate-500 font-semibold px-1 cursor-default"
            onDoubleClick={() => {
              if (editMode) {
                setTitleDraft(section.title);
                setIsEditing(true);
              }
            }}
          >
            {section.title}
          </span>
        )}

        {/* Delete button — only for empty sections in edit mode */}
        {editMode && items.length === 0 && (
          <button
            onClick={() => deleteSection(section.id)}
            className="p-0.5 text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            title="Delete empty section"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Items */}
      {!section.isCollapsed && (
        <div className={clsx(
          'space-y-0.5 min-h-[4px] rounded transition-colors',
          isOver && editMode && 'bg-blue-500/10'
        )}>
          {editMode ? (
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item) => (
                <SortableNavItem
                  key={item.id}
                  item={item}
                  collapsed={collapsed}
                  editMode={editMode}
                  onNavigate={onNavigate}
                />
              ))}
            </SortableContext>
          ) : (
            items.map((item) => (
              <SortableNavItem
                key={item.id}
                item={item}
                collapsed={collapsed}
                editMode={false}
                onNavigate={onNavigate}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
