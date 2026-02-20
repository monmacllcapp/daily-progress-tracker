import React, { useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { clsx } from 'clsx';
import { useTabConfigStore } from '../../store/tabConfigStore';

export interface TabConfig {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface PageTabsProps {
  pageId: string;
  tabs: TabConfig[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  reorderable?: boolean;
}

interface SortableTabProps {
  tab: TabConfig;
  isActive: boolean;
  reorderable: boolean;
  onTabChange: (tabId: string) => void;
}

function SortableTab({ tab, isActive, reorderable, onTabChange }: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tab.id,
    disabled: !reorderable,
  });

  const style = reorderable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
      }
    : undefined;

  // Filter out aria-disabled from attributes to prevent Playwright/a11y issues
  // when sortable is disabled (non-reorderable mode)
  const { 'aria-disabled': _ariaDisabled, ...safeAttributes } = attributes;

  return (
    <div ref={setNodeRef} style={style} {...safeAttributes}>
      <button
        onClick={() => {
          if (!isDragging) {
            onTabChange(tab.id);
          }
        }}
        className={clsx(
          'relative flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 shrink-0',
          'border backdrop-blur-sm',
          isActive
            ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
        )}
      >
        {/* Drag handle — only in reorderable mode */}
        {reorderable && (
          <span
            className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing shrink-0 -ml-1"
            {...listeners}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}

        {/* Icon */}
        {tab.icon && <span className="shrink-0">{tab.icon}</span>}

        {/* Label */}
        <span className="text-sm font-medium whitespace-nowrap">{tab.label}</span>
      </button>
    </div>
  );
}

export function PageTabs({
  pageId,
  tabs,
  activeTab,
  onTabChange,
  reorderable = false,
}: PageTabsProps) {
  const { getTabOrder, setTabOrder } = useTabConfigStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Get persisted tab order and merge with current tabs
  const orderedTabs = useMemo(() => {
    const defaultOrder = tabs.map((t) => t.id);
    const persistedOrder = getTabOrder(pageId, defaultOrder);

    // Reorder tabs array based on persisted order
    return persistedOrder
      .map((id) => tabs.find((t) => t.id === id))
      .filter(Boolean) as TabConfig[];
  }, [pageId, tabs, getTabOrder]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = orderedTabs.findIndex((t) => t.id === active.id);
      const newIndex = orderedTabs.findIndex((t) => t.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(orderedTabs, oldIndex, newIndex);
      setTabOrder(
        pageId,
        newOrder.map((t) => t.id)
      );
    },
    [orderedTabs, pageId, setTabOrder]
  );

  const tabContent = (
    <>
      {orderedTabs.map((tab) => (
        <SortableTab
          key={tab.id}
          tab={tab}
          isActive={activeTab === tab.id}
          reorderable={reorderable}
          onTabChange={onTabChange}
        />
      ))}
    </>
  );

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-2">
      {reorderable ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={orderedTabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
            {tabContent}
          </SortableContext>
        </DndContext>
      ) : (
        tabContent
      )}
    </div>
  );
}

export type { TabConfig, PageTabsProps };
