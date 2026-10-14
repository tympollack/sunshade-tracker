'use client';

import React from 'react';
import { WorkItem, HierarchyLevel, StatusDefinition } from '@/types/tracker';
import { SprintItemRow } from '@/components/SprintItemRow';
import { SchemaDeviation } from '@/lib/schema-deviation';

export interface SprintWorkItemListProps {
  items: WorkItem[];
  selectedItemIds?: Set<string>;
  onToggleSelectItem?: (itemId: string, e: React.MouseEvent) => void;
  isImmutable?: boolean | ((item: WorkItem) => boolean);
  onEditItem?: (item: WorkItem) => void;
  getItemHierarchy: (item: WorkItem) => HierarchyLevel[];
  getItemStatuses: (item: WorkItem) => StatusDefinition[];
  deviations?: SchemaDeviation[];
  onOpenReconciliation?: (dev: SchemaDeviation) => void;
  isAllProjects?: boolean;
  allProjects?: Array<{ id: string; name: string; slug?: string; settings?: any }>;
  projectSettings?: any;
  onUpdateStatus?: (itemId: string, status: string) => void;
  onUpdateSprint?: (itemId: string, sprint: string) => void;
  availableSprints?: string[];
  currentSprintName?: string;
  isTreeMode?: boolean;
  pointMode?: 'macro' | 'granular';
  emptyMessage?: string;
  className?: string;
}

export const SprintWorkItemList: React.FC<SprintWorkItemListProps> = ({
  items,
  selectedItemIds = new Set(),
  onToggleSelectItem,
  isImmutable = false,
  onEditItem,
  getItemHierarchy,
  getItemStatuses,
  deviations = [],
  onOpenReconciliation,
  isAllProjects = false,
  allProjects = [],
  projectSettings,
  onUpdateStatus,
  onUpdateSprint,
  availableSprints = [],
  currentSprintName,
  isTreeMode = false,
  pointMode = 'granular',
  emptyMessage = 'No work items found.',
  className = '',
}) => {
  if (items.length === 0) {
    return (
      <div className={`p-6 text-center text-xs text-slate-500 italic ${className}`} data-testid="sprint-empty-list">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`divide-y divide-slate-800/50 min-w-0 w-full ${className}`} data-testid="sprint-work-item-list">
      {items.map((item) => {
        const itemImmutable =
          typeof isImmutable === 'function' ? isImmutable(item) : Boolean(isImmutable);

        return (
          <SprintItemRow
            key={item.id}
            item={item}
            isSelected={selectedItemIds.has(item.id)}
            onToggleSelect={(id, e) => onToggleSelectItem?.(id, e)}
            isImmutable={itemImmutable}
            onEditItem={onEditItem || (() => {})}
            getItemHierarchy={getItemHierarchy}
            getItemStatuses={getItemStatuses}
            deviations={deviations}
            onOpenReconciliation={onOpenReconciliation}
            isAllProjects={isAllProjects}
            allProjects={allProjects}
            projectSettings={projectSettings}
            onUpdateStatus={onUpdateStatus}
            onUpdateSprint={onUpdateSprint}
            availableSprints={availableSprints}
            currentSprintName={currentSprintName}
            isTreeMode={isTreeMode}
            pointMode={pointMode}
          />
        );
      })}
    </div>
  );
};

export default SprintWorkItemList;
