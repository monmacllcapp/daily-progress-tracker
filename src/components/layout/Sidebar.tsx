import React, { useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PanelLeftClose,
  PanelLeft,
  X,
  Settings,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useSidebarStore } from './SidebarStore';
import type { NavItem } from '../../types/sidebar';
import { DynamicNavSection } from './DynamicNavSection';

export function Sidebar() {
  const {
    isCollapsed,
    isMobileOpen,
    editMode,
    config,
    toggleCollapsed,
    setMobileOpen,
    setEditMode,
    moveItem,
    reorderItems,
    createSection,
    resetConfig,
  } = useSidebarStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Build a map of itemId -> NavItem for quick lookup
  const itemMap = useMemo(() => {
    const m = new Map<string, NavItem>();
    config.items.forEach((item) => m.set(item.id, item));
    return m;
  }, [config.items]);

  // Find which section contains an item
  const findSectionForItem = useCallback(
    (itemId: string): string | null => {
      for (const sec of config.sections) {
        if (sec.itemIds.includes(itemId)) return sec.id;
      }
      return null;
    },
    [config.sections]
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const fromSection = findSectionForItem(activeId);
    if (!fromSection) return;

    // Check if over is a section droppable or another item
    const toSectionDirect = config.sections.find((s) => s.id === overId);
    if (toSectionDirect) {
      // Dropped on a section header/droppable — append to end
      if (fromSection === toSectionDirect.id) return;
      moveItem(
        activeId,
        fromSection,
        toSectionDirect.id,
        toSectionDirect.itemIds.length
      );
      return;
    }

    // Over is another item — find its section
    const toSection = findSectionForItem(overId);
    if (!toSection) return;

    const toSec = config.sections.find((s) => s.id === toSection)!;
    const overIndex = toSec.itemIds.indexOf(overId);

    if (fromSection === toSection) {
      const fromIndex = toSec.itemIds.indexOf(activeId);
      reorderItems(toSection, fromIndex, overIndex);
    } else {
      moveItem(activeId, fromSection, toSection, overIndex);
    }
  }

  const sidebarContent = (collapsed: boolean, onNavigate?: () => void) => {
    const navContent = (
      <>
        {config.sections.map((section, idx) => {
          const sectionItems = section.itemIds
            .map((id) => itemMap.get(id))
            .filter(Boolean) as NavItem[];

          return (
            <React.Fragment key={section.id}>
              {idx > 0 && <div className="border-t border-white/5" />}
              <DynamicNavSection
                section={section}
                items={sectionItems}
                collapsed={collapsed}
                editMode={editMode}
                onNavigate={onNavigate}
              />
            </React.Fragment>
          );
        })}

        {/* New Section button — edit mode only, not when collapsed */}
        {editMode && !collapsed && (
          <button
            onClick={() => createSection('New Section')}
            className="flex items-center gap-2 w-full px-3 py-2 text-slate-500 hover:text-slate-300 transition-colors text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Section</span>
          </button>
        )}
      </>
    );

    return (
      <div className="flex flex-col h-full">
        {/* Logo + edit mode toggle */}
        <div
          className={clsx(
            'flex items-center h-16 border-b border-white/5 shrink-0',
            collapsed ? 'justify-center px-2' : 'justify-between px-4'
          )}
        >
          {!collapsed && (
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-rose-400 bg-clip-text text-transparent">
              Maple
            </h1>
          )}
          <div className="flex items-center gap-1">
            {!collapsed && (
              <button
                onClick={() => setEditMode(!editMode)}
                className={clsx(
                  'p-1.5 rounded-lg transition-colors lg:block hidden',
                  editMode
                    ? 'text-blue-400 bg-blue-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
                title={editMode ? 'Exit edit mode' : 'Edit sidebar'}
              >
                <Settings className="w-4 h-4" style={{ strokeWidth: 1.5 }} />
              </button>
            )}
            <button
              onClick={toggleCollapsed}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors lg:block hidden"
            >
              {collapsed ? (
                <PanelLeft className="w-5 h-5" style={{ strokeWidth: 1.5 }} />
              ) : (
                <PanelLeftClose className="w-5 h-5" style={{ strokeWidth: 1.5 }} />
              )}
            </button>
          </div>
        </div>

        {/* Edit mode banner */}
        {editMode && !collapsed && (
          <div className="px-3 py-2 bg-blue-500/10 border-b border-blue-500/20 flex items-center justify-between">
            <span className="text-xs text-blue-300 font-medium">Edit Mode</span>
            <button
              onClick={() => resetConfig()}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              title="Reset to defaults"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-4 space-y-4">
          {editMode ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              {navContent}
            </DndContext>
          ) : (
            navContent
          )}
        </nav>
      </div>
    );
  };

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
