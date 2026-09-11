import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { QuickAddModal, QuickAddPayload } from '@/components/QuickAddModal';
import { HierarchyLevel, StatusDefinition } from '@/types/tracker';

const mockHierarchy: HierarchyLevel[] = [
  { level: 1, type: 'epic', label: 'Epic', allowed_parents: [] },
  { level: 2, type: 'story', label: 'Story', allowed_parents: ['epic'] },
  { level: 3, type: 'task', label: 'Task', allowed_parents: ['story'] },
];

const mockStatuses: StatusDefinition[] = [
  { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
  { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
  { id: 'done', label: 'Done', color: '#34d399', order: 3 },
];

const mockMembers = [
  { user_id: 'u-1', full_name: 'Alice Developer' },
  { user_id: 'u-2', full_name: 'Bob Tester' },
];

describe('QuickAddModal Component (TASK-TRK-QUICK-ADD-DIALOG)', () => {
  let onSubmit: any;
  let onClose: any;

  beforeEach(() => {
    onSubmit = vi.fn().mockResolvedValue({ id: 'item-1', title: 'New Item' });
    onClose = vi.fn();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <QuickAddModal
        isOpen={false}
        onClose={onClose}
        onSubmit={onSubmit}
        currentProjectSlug="sunshade-tracker"
        hierarchy={mockHierarchy}
        statuses={mockStatuses}
        workspaceMembers={mockMembers}
        myDisplayName="Tym Pollack"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog elements, auto-focuses title, and defaults values properly', () => {
    render(
      <QuickAddModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        currentProjectSlug="sunshade-tracker"
        hierarchy={mockHierarchy}
        statuses={mockStatuses}
        workspaceMembers={mockMembers}
        myDisplayName="Tym Pollack"
      />
    );

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Create Work Item' })).toBeDefined();

    // Title input
    const titleInput = screen.getByTestId('quick-add-title-input') as HTMLInputElement;
    expect(titleInput).toBeDefined();
    expect(titleInput.placeholder).toContain('What needs to be done?');

    // Hierarchy type default (lowest level: task)
    const typeSelect = screen.getByTestId('quick-add-type-select') as HTMLSelectElement;
    expect(typeSelect.value).toBe('task');
    expect(typeSelect.children.length).toBe(3);

    // Initial status default (first status: not_started)
    const statusSelect = screen.getByTestId('quick-add-status-select') as HTMLSelectElement;
    expect(statusSelect.value).toBe('not_started');
    expect(statusSelect.children.length).toBe(3);

    // Assignee default (myDisplayName)
    expect(screen.getByTestId('quick-add-assignee-btn').textContent).toContain('Tym Pollack');

    // External Ref input
    expect(screen.getByTestId('quick-add-ref-input')).toBeDefined();

    // Create another checkbox
    expect(screen.getByTestId('quick-add-create-another-checkbox')).toBeDefined();

    // Submit button disabled when title is empty
    const submitBtn = screen.getByTestId('quick-add-submit-btn') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('submits successfully with full payload and closes modal', async () => {
    render(
      <QuickAddModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        currentProjectSlug="sunshade-tracker"
        hierarchy={mockHierarchy}
        statuses={mockStatuses}
        workspaceMembers={mockMembers}
        myDisplayName="Tym Pollack"
      />
    );

    const titleInput = screen.getByTestId('quick-add-title-input');
    fireEvent.change(titleInput, { target: { value: 'Implement Fast Modal Entry' } });

    const typeSelect = screen.getByTestId('quick-add-type-select');
    fireEvent.change(typeSelect, { target: { value: 'story' } });

    const statusSelect = screen.getByTestId('quick-add-status-select');
    fireEvent.change(statusSelect, { target: { value: 'in_progress' } });

    const refInput = screen.getByTestId('quick-add-ref-input');
    fireEvent.change(refInput, { target: { value: 'SPEC-42' } });

    const submitBtn = screen.getByTestId('quick-add-submit-btn') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith({
      project_slug: 'sunshade-tracker',
      title: 'Implement Fast Modal Entry',
      item_type: 'story',
      status: 'in_progress',
      assignee: 'Tym Pollack',
      external_ref_id: 'SPEC-42',
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles "Create another item" checkbox: submits and clears inputs without closing', async () => {
    render(
      <QuickAddModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        currentProjectSlug="sunshade-tracker"
        hierarchy={mockHierarchy}
        statuses={mockStatuses}
        workspaceMembers={mockMembers}
        myDisplayName="Tym Pollack"
      />
    );

    const titleInput = screen.getByTestId('quick-add-title-input') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'First Batch Task' } });

    const refInput = screen.getByTestId('quick-add-ref-input') as HTMLInputElement;
    fireEvent.change(refInput, { target: { value: 'REF-01' } });

    const checkbox = screen.getByTestId('quick-add-create-another-checkbox');
    fireEvent.click(checkbox);

    const submitBtn = screen.getByTestId('quick-add-submit-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    // Should NOT close modal
    expect(onClose).not.toHaveBeenCalled();

    // Inputs cleared
    expect(titleInput.value).toBe('');
    expect(refInput.value).toBe('');
  });

  it('supports Shift + Enter in title input for rapid continuous entry', async () => {
    render(
      <QuickAddModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        currentProjectSlug="sunshade-tracker"
        hierarchy={mockHierarchy}
        statuses={mockStatuses}
        workspaceMembers={mockMembers}
        myDisplayName="Tym Pollack"
      />
    );

    const titleInput = screen.getByTestId('quick-add-title-input') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Rapid Entry via Shift+Enter' } });

    fireEvent.keyDown(titleInput, { key: 'Enter', shiftKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Rapid Entry via Shift+Enter',
      })
    );

    // Modal stays open and title resets
    expect(onClose).not.toHaveBeenCalled();
    expect(titleInput.value).toBe('');
  });

  it('closes on Escape key press and backdrop click', () => {
    const { rerender } = render(
      <QuickAddModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        currentProjectSlug="sunshade-tracker"
        hierarchy={mockHierarchy}
        statuses={mockStatuses}
        workspaceMembers={mockMembers}
        myDisplayName="Tym Pollack"
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    const dialogBackdrop = screen.getByTestId('quick-add-modal');
    fireEvent.click(dialogBackdrop);
    expect(onClose).toHaveBeenCalledTimes(2);

    const closeBtn = screen.getByTestId('quick-add-close-btn');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('allows picking workspace members or Unassigned from assignee dropdown', () => {
    render(
      <QuickAddModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        currentProjectSlug="sunshade-tracker"
        hierarchy={mockHierarchy}
        statuses={mockStatuses}
        workspaceMembers={mockMembers}
        myDisplayName="Tym Pollack"
      />
    );

    const assigneeBtn = screen.getByTestId('quick-add-assignee-btn');
    fireEvent.click(assigneeBtn);

    // Pick Bob Tester
    const bobOption = screen.getByText('Bob Tester');
    fireEvent.click(bobOption);

    expect(screen.getByTestId('quick-add-assignee-btn').textContent).toContain('Bob Tester');

    // Reopen and pick Unassigned
    fireEvent.click(screen.getByTestId('quick-add-assignee-btn'));
    const unassignedOption = screen.getByText('Unassigned');
    fireEvent.click(unassignedOption);

    expect(screen.getByTestId('quick-add-assignee-btn').textContent).toContain('Unassigned');
  });

  it('supports portfolio / allProjects selector when isAllProjects is true', async () => {
    const allProjects = [
      { id: 'p1', name: 'Sunshade Tracker', slug: 'sunshade-tracker' },
      { id: 'p2', name: 'Mobile App', slug: 'mobile-app' },
    ];

    render(
      <QuickAddModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        currentProjectSlug="sunshade-tracker"
        isAllProjects={true}
        allProjects={allProjects}
        hierarchy={mockHierarchy}
        statuses={mockStatuses}
        workspaceMembers={mockMembers}
        myDisplayName="Tym Pollack"
      />
    );

    const projectSelect = screen.getByTestId('quick-add-project-select') as HTMLSelectElement;
    expect(projectSelect).toBeDefined();
    expect(projectSelect.value).toBe('sunshade-tracker');

    fireEvent.change(projectSelect, { target: { value: 'mobile-app' } });

    const titleInput = screen.getByTestId('quick-add-title-input');
    fireEvent.change(titleInput, { target: { value: 'Multi-Project Work Item' } });

    const submitBtn = screen.getByTestId('quick-add-submit-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        project_slug: 'mobile-app',
        title: 'Multi-Project Work Item',
      })
    );
  });
});

describe('Dashboard Page Integration (TASK-TRK-HEADER-ADD-BUTTON & TASK-TRK-REMOVE-INLINE-ROW)', () => {
  const pagePath = path.resolve('src/app/(dashboard)/[tenantSlug]/[projectSlug]/page.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf8');

  it('renders "+ Add Item" trigger button in top navbar with keyboard shortcut badge (TASK-TRK-HEADER-ADD-BUTTON)', () => {
    expect(pageContent).toContain('data-testid="header-add-item-btn"');
    expect(pageContent).toContain('Add Item');
    expect(pageContent).toContain("title=\"Add Item (Press 'c' or 'n')\"");
    expect(pageContent).toContain('setIsQuickAddOpen(true)');
  });

  it('registers global keyboard shortcuts listener for "c" and "n" keys (TASK-TRK-HEADER-ADD-BUTTON)', () => {
    expect(pageContent).toContain("e.key !== 'c' && e.key !== 'n'");
    expect(pageContent).toContain("activeEl.tagName?.toUpperCase()");
    expect(pageContent).toContain("setIsQuickAddOpen(true)");
  });

  it('completely removes the inline Add Item creation bar from the board view DOM (TASK-TRK-REMOVE-INLINE-ROW)', () => {
    expect(pageContent).not.toContain('placeholder="New item title (e.g. Implement Webhook Dispatcher)..."');
    expect(pageContent).not.toContain('New item title (e.g. Implement Webhook Dispatcher)...');
    expect(pageContent).not.toContain('onSubmit={handleCreateItem}\n                className="p-4 rounded-xl bg-slate-900/60');
  });

  it('recalculates board vertical container heights to reclaim ~70px of canvas space (TASK-TRK-REMOVE-INLINE-ROW)', () => {
    expect(pageContent).toContain('md:h-[calc(100vh-140px)]');
    expect(pageContent).toContain('md:h-[calc(100vh-200px)]');
    expect(pageContent).not.toContain('md:h-[calc(100vh-270px)]');
  });

  it('mounts QuickAddModal with optimistic state update callback', () => {
    expect(pageContent).toContain('<QuickAddModal');
    expect(pageContent).toContain('isOpen={isQuickAddOpen}');
    expect(pageContent).toContain('onClose={() => setIsQuickAddOpen(false)}');
    expect(pageContent).toContain('onSubmit={handleCreateItem}');
  });
});
