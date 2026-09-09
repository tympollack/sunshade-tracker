import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SprintItemRow } from '@/components/SprintItemRow';
import { BulkActionsToolbar } from '@/components/BulkActionsToolbar';
import { WorkItem, HierarchyLevel, StatusDefinition } from '@/types/tracker';
import { isItemImmutableDueToCompletedSprint } from '@/lib/sprint-utils';

describe('Sprint Hierarchy and Bulk Actions (TASK-TRK-SPRINT-HIER-BULK-ACTIONS)', () => {
  const mockHierarchy: HierarchyLevel[] = [
    { level: 1, label: 'Epic', type: 'epic', color: '#8b5cf6', allowed_parents: [] },
    { level: 2, label: 'Story', type: 'story', color: '#0ea5e9', allowed_parents: ['epic'] },
    { level: 3, label: 'Task', type: 'task', color: '#10b981', allowed_parents: ['story'] },
  ];

  const mockStatuses: StatusDefinition[] = [
    { id: 'todo', label: 'To Do', color: '#64748b', order: 1000 },
    { id: 'in_progress', label: 'In Progress', color: '#0ea5e9', order: 2000 },
    { id: 'done', label: 'Done', color: '#10b981', order: 3000 },
  ];

  const baseItem: WorkItem = {
    id: 'item-1',
    tenant_id: 't1',
    project_id: 'p1',
    item_type: 'story',
    title: 'Core Authentication',
    status: 'in_progress',
    order_index: 1000,
    metadata: { story_points: 5, sprint: 'Sprint 1' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('renders tree hierarchy badges (subtask count, rollup points, connectors) in tree mode', () => {
    render(
      <SprintItemRow
        item={baseItem}
        depth={1}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={false}
        onEditItem={vi.fn()}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
        onUpdateStatus={vi.fn()}
        onUpdateSprint={vi.fn()}
        availableSprints={['Sprint 1', 'Sprint 2']}
        isTreeMode={true}
        childCount={3}
        rollupPoints={13}
      />
    );

    expect(screen.getByTestId('tree-branch-connector')).toBeDefined();
    expect(screen.getByTestId('tree-child-count-badge').textContent).toContain('3 subtasks');
    expect(screen.getByTestId('tree-rollup-points-badge').textContent).toContain('13 pts rollup');
  });

  it('renders locked badge and disables inputs for completed items in closed sprints', () => {
    const closedSprintItem: WorkItem = {
      ...baseItem,
      id: 'item-closed',
      status: 'done',
      metadata: { sprint: 'Sprint 2026-Q1', story_points: 3 },
    };

    render(
      <SprintItemRow
        item={closedSprintItem}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={true}
        onEditItem={vi.fn()}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
        onUpdateStatus={vi.fn()}
        onUpdateSprint={vi.fn()}
        availableSprints={['Sprint 2026-Q1', 'Sprint 2026-Q2']}
      />
    );

    // Locked badge is rendered
    expect(screen.getByTestId('immutable-lock-badge')).toBeDefined();
    expect(screen.getByTestId('immutable-lock-badge').textContent).toContain('Locked');

    // Status and sprint select are disabled
    const selects = screen.getAllByTitle('Item is locked in a closed sprint');
    expect(selects.length).toBe(2);
    selects.forEach((sel) => {
      expect((sel as HTMLSelectElement).disabled).toBe(true);
    });
  });

  it('supports shift-click range selection across items in a pool', () => {
    const items: WorkItem[] = [
      { ...baseItem, id: 'item-1', title: 'Task 1' },
      { ...baseItem, id: 'item-2', title: 'Task 2' },
      { ...baseItem, id: 'item-3', title: 'Task 3' },
      { ...baseItem, id: 'item-4', title: 'Task 4' },
    ];

    const RangeSelectionHarness = () => {
      const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
      const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

      const handleToggleSelect = (itemId: string, e: React.MouseEvent) => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (e.shiftKey && lastSelectedId) {
            const lastIdx = items.findIndex((it) => it.id === lastSelectedId);
            const currIdx = items.findIndex((it) => it.id === itemId);
            if (lastIdx !== -1 && currIdx !== -1) {
              const start = Math.min(lastIdx, currIdx);
              const end = Math.max(lastIdx, currIdx);
              for (let i = start; i <= end; i++) {
                next.add(items[i].id);
              }
              setLastSelectedId(itemId);
              return next;
            }
          }

          if (next.has(itemId)) {
            next.delete(itemId);
          } else {
            next.add(itemId);
          }
          setLastSelectedId(itemId);
          return next;
        });
      };

      return (
        <div>
          <span data-testid="selected-count">{selectedIds.size}</span>
          {items.map((it) => (
            <SprintItemRow
              key={it.id}
              item={it}
              isSelected={selectedIds.has(it.id)}
              onToggleSelect={handleToggleSelect}
              isImmutable={false}
              onEditItem={vi.fn()}
              getItemHierarchy={() => mockHierarchy}
              getItemStatuses={() => mockStatuses}
              onUpdateStatus={vi.fn()}
              onUpdateSprint={vi.fn()}
              availableSprints={['Sprint 1']}
            />
          ))}
        </div>
      );
    };

    render(<RangeSelectionHarness />);

    // Click item 1
    const btn1 = screen.getByLabelText('Select Task 1');
    fireEvent.click(btn1);
    expect(screen.getByTestId('selected-count').textContent).toBe('1');

    // Shift-click item 4
    const btn4 = screen.getByLabelText('Select Task 4');
    fireEvent.click(btn4, { shiftKey: true });

    // Items 1, 2, 3, 4 should all be selected (count = 4)
    expect(screen.getByTestId('selected-count').textContent).toBe('4');
  });

  it('evaluates isItemImmutableDueToCompletedSprint correctly against project settings', () => {
    const projectSettings = {
      sprint_settings: {
        sprints: [
          { id: 's1', name: 'Sprint 1', status: 'completed' as const },
          { id: 's2', name: 'Sprint 2', status: 'active' as const },
        ],
      },
    } as any;

    // Done item in completed sprint -> immutable
    expect(
      isItemImmutableDueToCompletedSprint(
        { ...baseItem, status: 'done', metadata: { sprint: 'Sprint 1' } },
        projectSettings
      )
    ).toBe(true);

    // In-progress item in completed sprint -> NOT immutable (can be rolled over)
    expect(
      isItemImmutableDueToCompletedSprint(
        { ...baseItem, status: 'in_progress', metadata: { sprint: 'Sprint 1' } },
        projectSettings
      )
    ).toBe(false);

    // Done item in active sprint -> NOT immutable
    expect(
      isItemImmutableDueToCompletedSprint(
        { ...baseItem, status: 'done', metadata: { sprint: 'Sprint 2' } },
        projectSettings
      )
    ).toBe(false);

    // Backlog item -> NOT immutable
    expect(
      isItemImmutableDueToCompletedSprint(
        { ...baseItem, status: 'done', metadata: {} },
        projectSettings
      )
    ).toBe(false);
  });
});
