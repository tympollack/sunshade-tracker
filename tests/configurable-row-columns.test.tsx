import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  ProjectSettings,
  WorkItem,
  WorkItemNode,
  HierarchyLevel,
  StatusDefinition,
} from '@/types/tracker';
import {
  resolveAvailableRowColumns,
  resolveEffectiveRowColumns,
  formatRowCellValue,
} from '@/lib/row-columns';
import { lintProjectSettings } from '@/lib/project-settings-schema';
import { validateProjectSettings } from '@/lib/project-settings-validator';
import { mergeProjectSettings } from '@/lib/portfolio-merge';
import { ProjectSchemaEditor } from '@/components/schema/ProjectSchemaEditor';
import { TreeViewContainer } from '@/components/views/TreeViewContainer';
import { SprintViewContainer } from '@/components/views/SprintViewContainer';

const mockHierarchy: HierarchyLevel[] = [
  { type: 'story', label: 'Story', level: 1, allowed_parents: [], color: '#38bdf8' },
  { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'], color: '#34d399' },
];

const mockStatuses: StatusDefinition[] = [
  { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
  { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
  { id: 'complete', label: 'Complete', color: '#22c55e', order: 3, is_completed: true },
];

const baseSettings: ProjectSettings = {
  schema_version: '1.0',
  hierarchy: mockHierarchy,
  statuses: mockStatuses,
  custom_fields: ['priority', 'complexity', 'story_points', 'agent_prompt', 'sprint'],
  custom_metadata_fields: [
    { key: 'ai_credits', label: 'AI Credits', type: 'number', unit: 'cr' },
    { key: 'is_blocked', label: 'Blocked Flag', type: 'boolean' },
    { key: 'target_date', label: 'Target Date', type: 'date' },
  ],
};

function createItem(overrides: Partial<WorkItemNode> = {}): WorkItemNode {
  return {
    id: 'item-col-1',
    tenant_id: 't1',
    project_id: 'p1',
    title: 'Schema-driven Column Row',
    item_type: 'task',
    status: 'in_progress',
    order_index: 1000,
    depth: 0,
    external_ref_id: 'TASK-COL-1',
    assignee: 'Tymz',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-20T12:00:00Z',
    metadata: {
      story_points: 5,
      sprint: 'Sprint 2026-Q4',
      priority: 'High',
      complexity: 3,
      ai_credits: 42,
      is_blocked: true,
      target_date: '2026-11-25',
      pr_url: 'https://github.com/tympollack/sunshade-tracker/pull/164',
    },
    children: [],
    ...overrides,
  };
}

describe('TASK-TRK-CONFIGURABLE-STATIC-DYNAMIC-FIELDS', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Core Column Resolution & Formatting (src/lib/row-columns.ts)', () => {
    it('discovers static columns and schema-defined dynamic fields while excluding internal keys', () => {
      const cols = resolveAvailableRowColumns(baseSettings);
      const keys = cols.map((c) => c.key);

      // Static columns
      expect(keys).toEqual(
        expect.arrayContaining(['ref_id', 'points', 'assignee', 'status', 'sprint', 'github', 'updated_at'])
      );
      // Dynamic fields
      expect(keys).toEqual(
        expect.arrayContaining(['priority', 'complexity', 'ai_credits', 'is_blocked', 'target_date'])
      );
      // Excluded verbose/internal keys
      expect(keys).not.toContain('agent_prompt');
      expect(keys).not.toContain('story_points');
    });

    it('resolves schema-driven row_columns filtered per view (tree vs table)', () => {
      const schemaSettings: ProjectSettings = {
        ...baseSettings,
        row_columns: [
          { key: 'ref_id', source: 'static', views: ['tree', 'table'] },
          { key: 'priority', label: 'Prio', source: 'dynamic', views: ['tree', 'table'] },
          { key: 'ai_credits', source: 'dynamic', views: ['table'] },
          { key: 'assignee', source: 'static', views: ['tree', 'table'] },
          { key: 'status', source: 'static', views: ['tree', 'table'] },
        ],
      };

      const treeCols = resolveEffectiveRowColumns(schemaSettings, 'tree').map((c) => c.key);
      expect(treeCols).toEqual(['ref_id', 'priority', 'assignee', 'status']);

      const tableCols = resolveEffectiveRowColumns(schemaSettings, 'table').map((c) => c.key);
      expect(tableCols).toEqual(['ref_id', 'priority', 'ai_credits', 'assignee', 'status']);
    });

    it('formats typed dynamic and static cell values accurately', () => {
      const item = createItem();
      const cols = resolveAvailableRowColumns(baseSettings);
      const byKey = new Map(cols.map((c) => [c.key, c]));

      expect(formatRowCellValue(item, byKey.get('priority')!)).toMatchObject({
        displayText: 'High',
        badgeVariant: 'danger',
        empty: false,
      });
      expect(formatRowCellValue(item, byKey.get('ai_credits')!)).toMatchObject({
        displayText: '42 cr',
        empty: false,
      });
      expect(formatRowCellValue(item, byKey.get('is_blocked')!)).toMatchObject({
        displayText: 'Yes',
        badgeVariant: 'success',
        empty: false,
      });
      expect(formatRowCellValue(item, byKey.get('sprint')!)).toMatchObject({
        displayText: 'Sprint 2026-Q4',
        badgeVariant: 'success',
      });

      const emptyItem = createItem({ metadata: {} });
      expect(formatRowCellValue(emptyItem, byKey.get('ai_credits')!)).toMatchObject({
        displayText: '—',
        empty: true,
      });
    });
  });

  describe('Schema Validation & Portfolio Merge', () => {
    it('validates row_columns in ProjectSettingsSchema and validateProjectSettings', () => {
      const validSettings: ProjectSettings = {
        ...baseSettings,
        row_columns: [
          { key: 'priority', source: 'dynamic', visible: true, views: ['tree', 'table'] },
        ],
      };
      expect(lintProjectSettings(validSettings).valid).toBe(true);
      expect(validateProjectSettings(validSettings).valid).toBe(true);

      const invalidSettings = {
        ...baseSettings,
        row_columns: [{ key: '' }],
      };
      expect(lintProjectSettings(invalidSettings).valid).toBe(false);
      expect(validateProjectSettings(invalidSettings).valid).toBe(false);
    });

    it('merges row_columns across portfolio projects', () => {
      const merged = mergeProjectSettings([
        {
          id: 'p1',
          slug: 'proj-1',
          settings: {
            ...baseSettings,
            row_columns: [{ key: 'priority', source: 'dynamic', views: ['tree'] }],
          },
        },
        {
          id: 'p2',
          slug: 'proj-2',
          settings: {
            ...baseSettings,
            row_columns: [{ key: 'ai_credits', source: 'dynamic', views: ['table'] }],
          },
        },
      ]);
      expect(merged.row_columns?.map((c) => c.key)).toEqual(['priority', 'ai_credits']);
    });
  });

  describe('ProjectSchemaEditor Row & Table Columns Configurator', () => {
    it('toggles Tree and Table column visibility in schema editor', () => {
      const handleChange = vi.fn();
      render(<ProjectSchemaEditor settings={baseSettings} onChange={handleChange} />);

      expect(screen.getByTestId('row-columns-config-editor')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('schema-row-col-tree-priority'));

      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          row_columns: expect.arrayContaining([
            expect.objectContaining({
              key: 'priority',
              views: expect.arrayContaining(['tree']),
            }),
          ]),
        })
      );
    });
  });

  describe('TreeViewContainer Configurable Columns & Header Alignment', () => {
    it('renders schema-driven dynamic columns and allows live toolbar toggling + reset', () => {
      const item = createItem();
      const schemaSettings: ProjectSettings = {
        ...baseSettings,
        row_columns: [
          { key: 'ref_id', source: 'static', views: ['tree'] },
          { key: 'points', source: 'static', views: ['tree'] },
          { key: 'priority', source: 'dynamic', views: ['tree'] },
          { key: 'assignee', source: 'static', views: ['tree'] },
          { key: 'status', source: 'static', views: ['tree'] },
        ],
      };

      render(
        <TreeViewContainer
          handleExpandAllTreeNodes={vi.fn()}
          handleCollapseAllTreeNodes={vi.fn()}
          selectedSprint="all"
          setSelectedSprint={vi.fn()}
          availableSprints={['Sprint 2026-Q4']}
          statusFilterOptions={[]}
          effectiveTreeStatuses={['not_started', 'in_progress', 'complete']}
          setTreeSelectedStatuses={vi.fn()}
          levelFilterOptions={[]}
          effectiveTreeLevels={['story', 'task']}
          setTreeSelectedLevels={vi.fn()}
          assigneeFilterOptions={[]}
          effectiveTreeAssignees={[]}
          setTreeSelectedAssignees={vi.fn()}
          treeSortBy="order_index"
          setTreeSortBy={vi.fn()}
          pointMode="granular"
          handlePointModeChange={vi.fn()}
          treeFilteredItems={[item]}
          projectSettings={schemaSettings}
          isReadOnly={false}
          loading={false}
          items={[item]}
          treeItems={[item]}
          isTreeRootOver={false}
          setIsTreeRootOver={vi.fn()}
          treeDraggedItemId={null}
          setTreeDraggedItemId={vi.fn()}
          handleTreeReparent={vi.fn()}
          getStatusColor={() => '#38bdf8'}
          deviations={[]}
          onOpenReconciliation={vi.fn()}
          getItemStatuses={() => mockStatuses}
          getItemHierarchy={() => mockHierarchy}
          workspaceMembers={[{ user_id: 'u1', full_name: 'Tymz' }]}
          getItemProjectSettings={() => schemaSettings}
          collapsedTreeNodes={new Set()}
          handleToggleCollapseTreeNode={vi.fn()}
          handleUpdateStatus={vi.fn()}
          handleTreeUpdateAssignee={vi.fn()}
          handleTreeCreateChild={vi.fn()}
          setEditingItem={vi.fn()}
          projectSlug="sunshade-tracker"
        />
      );

      // Header and dynamic priority column from schema are rendered
      const header = screen.getByTestId('tree-column-header');
      expect(within(header).getByTestId('col-header-priority')).toHaveTextContent('Priority');
      expect(screen.getByTestId(`row-cell-priority-${item.id}`)).toHaveTextContent('High');

      // Open Columns picker and enable ai_credits
      fireEvent.click(screen.getByTestId('row-columns-picker-btn-tree'));
      expect(screen.getByTestId('row-columns-popover-tree')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('row-column-toggle-ai_credits'));

      expect(within(header).getByTestId('col-header-ai_credits')).toHaveTextContent('AI Credits');
      expect(screen.getByTestId(`row-cell-ai_credits-${item.id}`)).toHaveTextContent('42 cr');

      // Reset to Schema removes local override
      fireEvent.click(screen.getByTestId('row-columns-reset-tree'));
      expect(screen.queryByTestId(`row-cell-ai_credits-${item.id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`row-cell-priority-${item.id}`)).toHaveTextContent('High');
    });
  });

  describe('SprintViewContainer Configurable Table Columns', () => {
    it('renders table column headers and allows toggling static/dynamic fields in Sprint rows', () => {
      const item = createItem();
      const schemaSettings: ProjectSettings = {
        ...baseSettings,
        row_columns: [
          { key: 'ref_id', source: 'static', views: ['table'] },
          { key: 'points', source: 'static', views: ['table'] },
          { key: 'priority', source: 'dynamic', views: ['table'] },
          { key: 'assignee', source: 'static', views: ['table'] },
          { key: 'status', source: 'static', views: ['table'] },
          { key: 'sprint', source: 'static', views: ['table'] },
          { key: 'github', source: 'static', views: ['table'] },
        ],
      };

      render(
        <SprintViewContainer
          items={[item]}
          projectSettings={schemaSettings}
          isReadOnly={false}
          pointMode="granular"
          handlePointModeChange={vi.fn()}
          sprintViewMode="flat"
          setSprintViewMode={vi.fn()}
          handleToggleCollapseAllSprints={vi.fn()}
          collapsedSprints={new Set()}
          toggleSprintCollapse={vi.fn()}
          handleToggleHideCompletedSprints={vi.fn()}
          hideCompletedSprints={false}
          hiddenCompletedSprintsCount={0}
          statusFilterOptions={[]}
          effectiveSprintStatuses={['not_started', 'in_progress', 'complete']}
          setSprintSelectedStatuses={vi.fn()}
          levelFilterOptions={[]}
          effectiveSprintLevels={['story', 'task']}
          setSprintSelectedLevels={vi.fn()}
          sprintSortBy="order_index"
          setSprintSortBy={vi.fn()}
          setIsManageSprintsOpen={vi.fn()}
          visibleSprints={['Sprint 2026-Q4']}
          availableSprints={['Sprint 2026-Q4']}
          filterSprintItems={(list) => list}
          sprintComparator={(a, b) => a.order_index - b.order_index}
          selectedItemIds={new Set()}
          handleToggleSelectItem={vi.fn()}
          handleSelectAllInPool={vi.fn()}
          activeSprintPopover={null}
          setActiveSprintPopover={vi.fn()}
          setEditingItem={vi.fn()}
          getItemHierarchy={() => mockHierarchy}
          getItemStatuses={() => mockStatuses}
          deviations={[]}
          setFocusedDeviationId={vi.fn()}
          setIsReconciliationModalOpen={vi.fn()}
          isAllProjects={false}
          allProjects={[]}
          handleUpdateStatus={vi.fn()}
          handleUpdateAssignee={vi.fn()}
          handleUpdateItemSprint={vi.fn()}
          projectSlug="sunshade-tracker"
        />
      );

      const header = screen.getByTestId('sprint-column-header-Sprint 2026-Q4');
      expect(within(header).getByTestId('col-header-priority')).toHaveTextContent('Priority');
      expect(within(header).getByTestId('col-header-github')).toHaveTextContent('GitHub');
      expect(screen.getByTestId(`row-cell-priority-${item.id}`)).toHaveTextContent('High');
      expect(screen.getByTestId(`row-cell-github-${item.id}`)).toBeInTheDocument();

      // Toggle off github and toggle on complexity
      fireEvent.click(screen.getByTestId('row-columns-picker-btn-table'));
      fireEvent.click(screen.getByTestId('row-column-toggle-github'));
      fireEvent.click(screen.getByTestId('row-column-toggle-complexity'));

      expect(screen.queryByTestId(`row-cell-github-${item.id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`row-cell-complexity-${item.id}`)).toHaveTextContent('3');
    });
  });
});
