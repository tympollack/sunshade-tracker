import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CopyableRefId } from '@/components/CopyableRefId';
import { WorkItemModal } from '@/components/WorkItemModal';
import { TreeNode } from '@/components/TreeNode';
import { SprintItemRow } from '@/components/SprintItemRow';
import { ProjectSettings, WorkItemNode } from '@/types/tracker';
import fs from 'fs';
import path from 'path';

// Mock clipboard
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

describe('TRK-05: CopyableRefId Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders reference ID with hash icon when showHash is true', () => {
    render(<CopyableRefId id="TASK-101" showHash />);
    const btn = screen.getByTestId('copyable-ref-id-TASK-101');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('TASK-101');
    expect(btn.querySelector('svg')).toBeInTheDocument(); // Hash icon
  });

  it('renders formatted text with brackets when brackets is true', () => {
    render(<CopyableRefId id="STORY-202" brackets />);
    const btn = screen.getByTestId('copyable-ref-id-STORY-202');
    expect(btn).toHaveTextContent('[STORY-202]');
  });

  it('renders displayId when provided (e.g. truncated UUID)', () => {
    render(<CopyableRefId id="066fd6f6-3278-4515-9050-26141a53a4fa" displayId="066fd6f6" showHash />);
    const btn = screen.getByTestId('copyable-ref-id-066fd6f6-3278-4515-9050-26141a53a4fa');
    expect(btn).toHaveTextContent('066fd6f6');
  });

  it('copies ID to clipboard on click, stops propagation, and displays Copied! feedback', async () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <CopyableRefId id="TRK-05" showHash />
      </div>
    );

    const btn = screen.getByTestId('copyable-ref-id-TRK-05');
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(mockWriteText).toHaveBeenCalledWith('TRK-05');
    expect(parentClick).not.toHaveBeenCalled(); // stopPropagation

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });
});

describe('TRK-05: WorkItemModal One-Click Copy', () => {
  const mockSettings: ProjectSettings = {
    schema_version: '1',
    custom_fields: [],
    hierarchy: [
      { type: 'epic', label: 'Epic', level: 0, color: '#f59e0b', allowed_parents: [] },
      { type: 'story', label: 'Story', level: 1, color: '#3b82f6', allowed_parents: ['epic'] },
      { type: 'task', label: 'Task', level: 2, color: '#10b981', allowed_parents: ['story'] },
    ],
    statuses: [
      { id: 'backlog', label: 'Backlog', color: '#64748b', order: 0 },
      { id: 'in_progress', label: 'In Progress', color: '#3b82f6', order: 1 },
      { id: 'complete', label: 'Complete', color: '#10b981', order: 2 },
    ],
    metadata_fields: [],
  };

  const mockItem = {
    id: 'item-uuid-12345',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    parent_id: null,
    external_ref_id: 'TASK-TRK-COPY',
    item_type: 'task',
    status: 'in_progress',
    title: 'Test work item for one-click copy',
    description: 'Testing copy buttons',
    order_index: 1000,
    assignee: 'tympollack',
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };

  const mockChildItem = {
    id: 'child-uuid-67890',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    parent_id: 'item-uuid-12345',
    external_ref_id: 'SUBTASK-TRK-01',
    item_type: 'task',
    status: 'backlog',
    title: 'Child work item',
    description: '',
    order_index: 2000,
    assignee: null,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dedicated Copy ID button in action bar and copies external_ref_id', async () => {
    render(
      <WorkItemModal
        item={mockItem}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        projectSettings={mockSettings}
        allItems={[mockItem]}
      />
    );

    const copyBtn = screen.getByTestId('modal-copy-id-btn');
    expect(copyBtn).toBeInTheDocument();
    expect(copyBtn).toHaveTextContent('Copy ID');

    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(mockWriteText).toHaveBeenCalledWith('TASK-TRK-COPY');

    await waitFor(() => {
      expect(screen.getByText('Copied ID')).toBeInTheDocument();
    });
  });

  it('renders CopyableRefId in modal header and allows clicking the ID badge to copy', async () => {
    render(
      <WorkItemModal
        item={mockItem}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        projectSettings={mockSettings}
        allItems={[mockItem]}
      />
    );

    const refBadge = screen.getByTestId('copyable-ref-id-TASK-TRK-COPY');
    expect(refBadge).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(refBadge);
    });
    expect(mockWriteText).toHaveBeenCalledWith('TASK-TRK-COPY');

    await waitFor(() => {
      expect(refBadge).toHaveTextContent('Copied!');
    });
  });

  it('renders CopyableRefId in child items list and copies child ID without selecting child item', async () => {
    const onSelectItem = vi.fn();
    render(
      <WorkItemModal
        item={mockItem}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        projectSettings={mockSettings}
        allItems={[mockItem, mockChildItem]}
        onSelectItem={onSelectItem}
      />
    );

    // Switch to Children tab
    const childrenTab = screen.getByTestId('modal-tab-children');
    await act(async () => {
      fireEvent.click(childrenTab);
    });

    const childRef = screen.getByTestId('copyable-ref-id-SUBTASK-TRK-01');
    expect(childRef).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(childRef);
    });
    expect(mockWriteText).toHaveBeenCalledWith('SUBTASK-TRK-01');
    expect(onSelectItem).not.toHaveBeenCalled();
  });
});

describe('BUG-TRK-TOPNAV-BREATHING-ROOM: Vertical Spacing & Centering', () => {
  it('verifies page.tsx top view tabs container has my-auto and self-center for balanced breathing room', () => {
    const pageContent = fs.readFileSync(
      path.resolve(__dirname, '../src/app/(dashboard)/[tenantSlug]/[projectSlug]/page.tsx'),
      'utf-8'
    );

    // Top view switcher tabs container
    expect(pageContent).toContain('data-testid="top-view-tabs"');
    expect(pageContent).toContain('my-auto self-center');
    expect(pageContent).toContain('hidden md:flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg text-xs');
  });
});

describe('BUG-TRK-CARD-REFID-PILL-OVERLAP: Inline Flex Layout on Kanban Cards', () => {
  it('verifies page.tsx Kanban card header renders type selector and CopyableRefId as side-by-side flex siblings', () => {
    const pageContent = fs.readFileSync(
      path.resolve(__dirname, '../src/app/(dashboard)/[tenantSlug]/[projectSlug]/page.tsx'),
      'utf-8'
    );

    // Header flex container
    expect(pageContent).toContain('flex items-center justify-between text-xs gap-2 min-w-0 w-full mb-2');
    // Left side flex container containing Grip, Selector, and Ref ID
    expect(pageContent).toContain('flex items-center gap-1.5 min-w-0 flex-1 flex-wrap sm:flex-nowrap');
    // Quick Level Selector is shrink-0
    expect(pageContent).toContain('relative inline-flex items-center shrink-0');
    // CopyableRefId follows selector with shrink-0
    expect(pageContent).toContain('<CopyableRefId');
    expect(pageContent).toContain('id={item.external_ref_id}');
    // Action buttons container on the right
    expect(pageContent).toContain('flex items-center space-x-1 shrink-0 ml-auto');
  });
});

describe('TRK-05: TreeNode & SprintItemRow Integration', () => {
  const mockNode: WorkItemNode = {
    id: 'tree-node-1',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    parent_id: null,
    external_ref_id: 'FEAT-TREE-01',
    item_type: 'story',
    status: 'in_progress',
    title: 'Hierarchy Story Item',
    order_index: 1000,
    depth: 0,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    children: [],
  };

  it('TreeNode renders CopyableRefId with brackets and copies on click', async () => {
    const onEdit = vi.fn();
    render(
      <TreeNode
        item={mockNode}
        onEditItem={onEdit}
      />
    );

    const refBtn = screen.getByTestId('copyable-ref-id-FEAT-TREE-01');
    expect(refBtn).toBeInTheDocument();
    expect(refBtn).toHaveTextContent('[FEAT-TREE-01]');

    await act(async () => {
      fireEvent.click(refBtn);
    });
    expect(mockWriteText).toHaveBeenCalledWith('FEAT-TREE-01');
    expect(onEdit).not.toHaveBeenCalled(); // Does not open edit modal
  });

  it('SprintItemRow renders CopyableRefId and copies on click without triggering row edit', async () => {
    const onEdit = vi.fn();
    render(
      <SprintItemRow
        item={mockNode}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={false}
        onEditItem={onEdit}
        getItemHierarchy={() => [{ type: 'story', label: 'Story', level: 1, color: '#3b82f6', allowed_parents: [] }]}
        getItemStatuses={() => [{ id: 'in_progress', label: 'In Progress', color: '#3b82f6', order: 1 }]}
      />
    );

    const refBtn = screen.getByTestId('copyable-ref-id-FEAT-TREE-01');
    expect(refBtn).toBeInTheDocument();
    expect(refBtn).toHaveTextContent('FEAT-TREE-01');

    await act(async () => {
      fireEvent.click(refBtn);
    });
    expect(mockWriteText).toHaveBeenCalledWith('FEAT-TREE-01');
    expect(onEdit).not.toHaveBeenCalled();
  });
});
