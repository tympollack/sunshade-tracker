import React from 'react';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkItemSelection } from '@/hooks/useWorkItemSelection';
import {
  WorkItemInspectorDrawer,
  inferFieldDefinitionFromKey,
  formatFieldLabel,
  calculateFieldVariance,
} from '@/components/drawer/WorkItemInspectorDrawer';
import { MobileItemBottomSheet } from '@/components/drawer/MobileItemBottomSheet';
import { WorkItem, CustomMetadataFieldDefinition } from '@/types/tracker';

const mockItems: WorkItem[] = [
  {
    id: 'item-101',
    tenant_id: 't-1',
    project_id: 'p-1',
    external_ref_id: 'TASK-TRK-01',
    item_type: 'task',
    status: 'in_progress',
    title: 'Inspector Drawer Implementation',
    description: 'Build fast non-blocking triage panel',
    order_index: 1000,
    assignee: 'tympollack',
    metadata: { sprint: 'Sprint 2026-Q4', story_points: 5 },
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
];

describe('TASK-TRK-RHN-INSPECTOR-DRAWER: Inspector Drawer & Mobile Bottom Sheet', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', 'http://localhost:3000/pym-energy/board');
    vi.clearAllMocks();
  });

  describe('useWorkItemSelection URL State Management', () => {
    it('synchronizes selected item with ?item= URL search parameter', () => {
      const { result } = renderHook(() =>
        useWorkItemSelection({ items: mockItems })
      );

      expect(result.current.selectedItem).toBeNull();
      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.selectItem(mockItems[0]);
      });

      expect(result.current.selectedItem?.id).toBe('item-101');
      expect(result.current.isOpen).toBe(true);
      expect(window.location.search).toContain('item=TASK-TRK-01');

      act(() => {
        result.current.close();
      });

      expect(result.current.selectedItem).toBeNull();
      expect(result.current.isOpen).toBe(false);
      expect(window.location.search).not.toContain('item=TASK-TRK-01');
    });

    it('automatically opens inspector on initial load when deep-linked with ?item=', () => {
      window.history.replaceState(null, '', 'http://localhost:3000/pym-energy/board?item=TASK-TRK-01');

      const { result } = renderHook(() =>
        useWorkItemSelection({ items: mockItems })
      );

      expect(result.current.selectedItem?.id).toBe('item-101');
      expect(result.current.isOpen).toBe(true);
    });

    it('dismisses drawer when Escape key is pressed', () => {
      const { result } = renderHook(() =>
        useWorkItemSelection({ items: mockItems })
      );

      act(() => {
        result.current.selectItem(mockItems[0]);
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.selectedItem).toBeNull();
    });
  });

  describe('WorkItemInspectorDrawer Component', () => {
    it('renders editable fields (title, status, assignee, story points, sprint)', () => {
      const onUpdate = vi.fn();
      const onClose = vi.fn();

      render(
        <WorkItemInspectorDrawer
          item={mockItems[0]}
          isOpen={true}
          onClose={onClose}
          onUpdateItem={onUpdate}
          tenantSlug="pym-energy"
        />
      );

      expect(screen.getByDisplayValue('Inspector Drawer Implementation')).toBeInTheDocument();
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
      expect(screen.getByLabelText('Story Points')).toHaveValue(5);
      expect(screen.getByLabelText('Description')).toHaveValue('Build fast non-blocking triage panel');

      // Test close button
      const closeBtn = screen.getByLabelText('Close Inspector');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onUpdateItem when a field changes', () => {
      const onUpdate = vi.fn();
      render(
        <WorkItemInspectorDrawer
          item={mockItems[0]}
          isOpen={true}
          onClose={vi.fn()}
          onUpdateItem={onUpdate}
          tenantSlug="pym-energy"
        />
      );

      const statusSelect = screen.getByLabelText('Status');
      act(() => {
        fireEvent.change(statusSelect, { target: { value: 'completed' } });
      });
      expect(onUpdate).toHaveBeenCalledWith('item-101', expect.objectContaining({ status: 'completed' }));
    });
  });

  describe('MobileItemBottomSheet Component', () => {
    it('renders bottom sheet modal with drag handle and backdrop', () => {
      const onClose = vi.fn();
      render(
        <MobileItemBottomSheet
          item={mockItems[0]}
          isOpen={true}
          onClose={onClose}
          tenantSlug="pym-energy"
        />
      );

      expect(screen.getByTestId('mobile-item-bottom-sheet')).toBeInTheDocument();
      expect(screen.getByTestId('sheet-drag-handle')).toBeInTheDocument();

      const backdrop = screen.getByTestId('bottom-sheet-backdrop');
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('TASK-TRK-DYNAMIC-PROPERTIES-RENDERER: Dynamic Custom Fields & Variance Inspection', () => {
    const mockSchemaItem: WorkItem = {
      id: 'item-202',
      tenant_id: 't-1',
      project_id: 'p-1',
      external_ref_id: 'TASK-TRK-02',
      item_type: 'task',
      status: 'in_progress',
      title: 'Dynamic Properties Implementation',
      description: 'Render schema driven fields with variance badges',
      order_index: 2000,
      assignee: 'tympollack',
      metadata: {
        sprint: 'Sprint 2026-Q4',
        planned_hours: 10,
        actual_hours: 12,
        priority: 'High',
        due_date: '2026-11-01',
        is_blocked: false,
        client_notes: 'Critical enterprise deliverable',
      },
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    };

    it('infers field types correctly from keys and formats labels', () => {
      expect(inferFieldDefinitionFromKey('planned_hours').type).toBe('number');
      expect(inferFieldDefinitionFromKey('actual_hours').type).toBe('number');
      expect(inferFieldDefinitionFromKey('budget').type).toBe('number');
      expect(inferFieldDefinitionFromKey('due_date').type).toBe('date');
      expect(inferFieldDefinitionFromKey('is_blocked').type).toBe('boolean');
      expect(inferFieldDefinitionFromKey('priority').type).toBe('enum');
      expect(inferFieldDefinitionFromKey('client_notes').type).toBe('string');
      expect(formatFieldLabel('planned_hours')).toBe('Planned Hours');
    });

    it('calculates variance delta and percent difference correctly', () => {
      // Over (12 vs 10) -> +2 (+20%)
      const over = calculateFieldVariance(12, 10, 'planned_hours');
      expect(over).toEqual({
        delta: 2,
        percentDiff: 20,
        status: 'over',
        targetKey: 'planned_hours',
        targetValue: 10,
        actualValue: 12,
      });

      // Under (8 vs 10) -> -2 (-20%)
      const under = calculateFieldVariance(8, 10, 'planned_hours');
      expect(under).toEqual({
        delta: -2,
        percentDiff: -20,
        status: 'under',
        targetKey: 'planned_hours',
        targetValue: 10,
        actualValue: 8,
      });

      // Equal (10 vs 10) -> 0 (0%)
      const equal = calculateFieldVariance(10, 10, 'planned_hours');
      expect(equal).toEqual({
        delta: 0,
        percentDiff: 0,
        status: 'equal',
        targetKey: 'planned_hours',
        targetValue: 10,
        actualValue: 10,
      });

      // Target = 0 -> delta 5, percentDiff null
      const zeroTarget = calculateFieldVariance(5, 0, 'planned_hours');
      expect(zeroTarget?.delta).toBe(5);
      expect(zeroTarget?.percentDiff).toBeNull();

      // Null or invalid -> null
      expect(calculateFieldVariance(null, 10, 'planned_hours')).toBeNull();
      expect(calculateFieldVariance(10, null, 'planned_hours')).toBeNull();
    });

    it('renders dynamic controls for number, string, enum, boolean, date and displays variance badge', () => {
      const customMetadataFields: CustomMetadataFieldDefinition[] = [
        { key: 'planned_hours', label: 'Planned Hours', type: 'number', unit: 'hrs' },
        { key: 'actual_hours', label: 'Actual Hours', type: 'number', target_field: 'planned_hours', unit: 'hrs' },
        { key: 'priority', label: 'Priority', type: 'enum', options: ['High', 'Medium', 'Low'] },
        { key: 'due_date', label: 'Due Date', type: 'date' },
        { key: 'is_blocked', label: 'Is Blocked', type: 'boolean' },
        { key: 'client_notes', label: 'Client Notes', type: 'string' },
      ];

      render(
        <WorkItemInspectorDrawer
          item={mockSchemaItem}
          isOpen={true}
          onClose={vi.fn()}
          customMetadataFields={customMetadataFields}
          tenantSlug="pym-energy"
        />
      );

      // Verify custom properties section is rendered
      expect(screen.getByTestId('dynamic-custom-fields-section')).toBeInTheDocument();

      // Verify each control is rendered with proper values
      expect(screen.getByLabelText('Planned Hours')).toHaveValue(10);
      expect(screen.getByLabelText('Actual Hours')).toHaveValue(12);
      expect(screen.getByLabelText('Priority')).toHaveValue('High');
      expect(screen.getByLabelText('Due Date')).toHaveValue('2026-11-01');
      expect(screen.getByLabelText('Is Blocked')).not.toBeChecked();
      expect(screen.getByLabelText('Client Notes')).toHaveValue('Critical enterprise deliverable');

      // Verify variance badge (+2 (+20%)) is displayed for actual_hours vs planned_hours
      const varianceBadge = screen.getByTestId('variance-badge-actual_hours');
      expect(varianceBadge).toBeInTheDocument();
      expect(varianceBadge).toHaveTextContent('+2 (+20%)');
      expect(varianceBadge.className).toContain('text-amber-300');
    });

    it('updates number, string, enum, boolean, and date fields and dispatches onUpdateItem with updated metadata', () => {
      const onUpdate = vi.fn();
      const customMetadataFields: CustomMetadataFieldDefinition[] = [
        { key: 'planned_hours', label: 'Planned Hours', type: 'number' },
        { key: 'priority', label: 'Priority', type: 'enum', options: ['High', 'Medium', 'Low'] },
        { key: 'is_blocked', label: 'Is Blocked', type: 'boolean' },
        { key: 'due_date', label: 'Due Date', type: 'date' },
        { key: 'client_notes', label: 'Client Notes', type: 'string' },
      ];

      render(
        <WorkItemInspectorDrawer
          item={mockSchemaItem}
          isOpen={true}
          onClose={vi.fn()}
          onUpdateItem={onUpdate}
          customMetadataFields={customMetadataFields}
          tenantSlug="pym-energy"
        />
      );

      // 1. Update enum field
      const prioritySelect = screen.getByLabelText('Priority');
      act(() => {
        fireEvent.change(prioritySelect, { target: { value: 'Medium' } });
      });
      expect(onUpdate).toHaveBeenCalledWith(
        'item-202',
        expect.objectContaining({
          metadata: expect.objectContaining({ priority: 'Medium' }),
        })
      );

      // 2. Update boolean field
      const blockedCheckbox = screen.getByLabelText('Is Blocked');
      act(() => {
        fireEvent.click(blockedCheckbox);
      });
      expect(onUpdate).toHaveBeenCalledWith(
        'item-202',
        expect.objectContaining({
          metadata: expect.objectContaining({ is_blocked: true }),
        })
      );

      // 3. Update date field
      const dateInput = screen.getByLabelText('Due Date');
      act(() => {
        fireEvent.change(dateInput, { target: { value: '2026-12-15' } });
      });
      expect(onUpdate).toHaveBeenCalledWith(
        'item-202',
        expect.objectContaining({
          metadata: expect.objectContaining({ due_date: '2026-12-15' }),
        })
      );

      // 4. Update string field on blur
      const notesInput = screen.getByLabelText('Client Notes');
      act(() => {
        fireEvent.change(notesInput, { target: { value: 'Updated notes content' } });
        fireEvent.blur(notesInput);
      });
      expect(onUpdate).toHaveBeenCalledWith(
        'item-202',
        expect.objectContaining({
          metadata: expect.objectContaining({ client_notes: 'Updated notes content' }),
        })
      );

      // 5. Update number field on blur
      const hoursInput = screen.getByLabelText('Planned Hours');
      act(() => {
        fireEvent.change(hoursInput, { target: { value: '18' } });
        fireEvent.blur(hoursInput);
      });
      expect(onUpdate).toHaveBeenCalledWith(
        'item-202',
        expect.objectContaining({
          metadata: expect.objectContaining({ planned_hours: 18 }),
        })
      );
    });

    it('automatically pairs numeric comparison fields via heuristics (e.g. budget vs actual_cost)', () => {
      const budgetItem: WorkItem = {
        ...mockSchemaItem,
        metadata: {
          budget: 1000,
          actual_cost: 800,
        },
      };

      const customMetadataFields: CustomMetadataFieldDefinition[] = [
        { key: 'budget', label: 'Budget', type: 'number' },
        { key: 'actual_cost', label: 'Actual Cost', type: 'number' },
      ];

      render(
        <WorkItemInspectorDrawer
          item={budgetItem}
          isOpen={true}
          onClose={vi.fn()}
          customMetadataFields={customMetadataFields}
          tenantSlug="pym-energy"
        />
      );

      // Under budget: -200 (-20%)
      const badge = screen.getByTestId('variance-badge-actual_cost');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('-200 (-20%)');
      expect(badge.className).toContain('text-emerald-300');
    });

    it('updates variance badge in real-time as the user edits the actual numeric value', () => {
      const customMetadataFields: CustomMetadataFieldDefinition[] = [
        { key: 'planned_hours', label: 'Planned Hours', type: 'number' },
        { key: 'actual_hours', label: 'Actual Hours', type: 'number', target_field: 'planned_hours' },
      ];

      render(
        <WorkItemInspectorDrawer
          item={mockSchemaItem}
          isOpen={true}
          onClose={vi.fn()}
          customMetadataFields={customMetadataFields}
          tenantSlug="pym-energy"
        />
      );

      const badge = screen.getByTestId('variance-badge-actual_hours');
      expect(badge).toHaveTextContent('+2 (+20%)');

      // Change actual hours to 10 (equal)
      const actualInput = screen.getByLabelText('Actual Hours');
      act(() => {
        fireEvent.change(actualInput, { target: { value: '10' } });
      });
      expect(screen.getByTestId('variance-badge-actual_hours')).toHaveTextContent('0 (0%)');
      expect(screen.getByTestId('variance-badge-actual_hours').className).toContain('text-slate-300');

      // Change actual hours to 5 (under by -5, -50%)
      act(() => {
        fireEvent.change(actualInput, { target: { value: '5' } });
      });
      expect(screen.getByTestId('variance-badge-actual_hours')).toHaveTextContent('-5 (-50%)');
      expect(screen.getByTestId('variance-badge-actual_hours').className).toContain('text-emerald-300');
    });

    it('renders inferred custom fields when projectSettings.custom_fields string array is passed', () => {
      render(
        <WorkItemInspectorDrawer
          item={mockSchemaItem}
          isOpen={true}
          onClose={vi.fn()}
          projectSettings={{
            schema_version: '1.0',
            hierarchy: [],
            statuses: [],
            custom_fields: ['planned_hours', 'actual_hours', 'due_date'],
          }}
          tenantSlug="pym-energy"
        />
      );

      expect(screen.getByLabelText('Planned Hours')).toBeInTheDocument();
      expect(screen.getByLabelText('Actual Hours')).toBeInTheDocument();
      expect(screen.getByLabelText('Due Date')).toBeInTheDocument();
      expect(screen.getByTestId('variance-badge-actual_hours')).toHaveTextContent('+2 (+20%)');
    });

    it('disables all custom field controls when isReadOnly is true', () => {
      const customMetadataFields: CustomMetadataFieldDefinition[] = [
        { key: 'planned_hours', label: 'Planned Hours', type: 'number' },
        { key: 'priority', label: 'Priority', type: 'enum', options: ['High', 'Medium'] },
        { key: 'is_blocked', label: 'Is Blocked', type: 'boolean' },
        { key: 'due_date', label: 'Due Date', type: 'date' },
        { key: 'client_notes', label: 'Client Notes', type: 'string' },
      ];

      render(
        <WorkItemInspectorDrawer
          item={mockSchemaItem}
          isOpen={true}
          onClose={vi.fn()}
          isReadOnly={true}
          customMetadataFields={customMetadataFields}
          tenantSlug="pym-energy"
        />
      );

      expect(screen.getByLabelText('Planned Hours')).toBeDisabled();
      expect(screen.getByLabelText('Priority')).toBeDisabled();
      expect(screen.getByLabelText('Is Blocked')).toBeDisabled();
      expect(screen.getByLabelText('Due Date')).toBeDisabled();
      expect(screen.getByLabelText('Client Notes')).toBeDisabled();
    });
  });
});
