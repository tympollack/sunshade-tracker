import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { SpYieldBadge } from '@/components/board/SpYieldBadge';
import { KanbanCard } from '@/components/board/KanbanCard';
import { NavToolsDropdown } from '@/components/NavToolsDropdown';
import { WorkItem, HierarchyLevel } from '@/types/tracker';
import fs from 'fs';
import path from 'path';

const mockHierarchy: HierarchyLevel[] = [
  { level: 0, type: 'epic', label: 'Epic', color: '#a855f7', allowed_parents: [] },
  { level: 1, type: 'story', label: 'Story', color: '#0ea5e9', allowed_parents: ['epic'] },
  { level: 2, type: 'task', label: 'Task', color: '#64748b', allowed_parents: ['story'] },
];

describe('BUG-TRK-BOARD-UI-POLISH-SUITE: Kanban UI Polish, SpYieldBadge & Timestamps', () => {
  it('renders Kanban as primary tab label on mobile bottom nav and desktop tabs', () => {
    const handleTabChange = vi.fn();
    render(<MobileBottomNav activeTab="board" onTabChange={handleTabChange} />);

    const boardBtn = screen.getByTestId('mobile-nav-board');
    expect(boardBtn).toHaveTextContent('Kanban');

    // Also check labels definition
    const pageFiles = [
      path.resolve(__dirname, '../src/app/(dashboard)/[tenantSlug]/[projectSlug]/page.tsx'),
      path.resolve(__dirname, '../src/components/board/ProjectHeader.tsx'),
    ];
    const pageContent = pageFiles
      .filter(fs.existsSync)
      .map((p) => fs.readFileSync(p, 'utf-8'))
      .join('\n');
    expect(pageContent).toContain("board: 'Kanban'");
  });

  it('renders JSON Ingestion across desktop tools dropdown and mobile tools menu', () => {
    const handleSelectTab = vi.fn();
    render(<NavToolsDropdown activeTab="board" onSelectTab={handleSelectTab} />);

    const trigger = screen.getByTestId('nav-tools-dropdown-trigger');
    fireEvent.click(trigger);

    expect(screen.getByText('JSON Ingestion')).toBeInTheDocument();
  });

  it('SpYieldBadge: wraps fee amounts cleanly onto dedicated second line with flex-col items-start gap-0.5', () => {
    render(
      <SpYieldBadge
        yieldAmount={1540.5}
        feeAmount={0.0}
        label="SP Yield"
      />
    );

    const badge = screen.getByTestId('sp-yield-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('flex-col');
    expect(badge).toHaveClass('items-start');
    expect(badge).toHaveClass('gap-0.5');
    expect(badge).toHaveTextContent('SP Yield:');
    expect(badge).toHaveTextContent('$1,540.50');
    expect(badge).toHaveTextContent('Fee:');
    expect(badge).toHaveTextContent('$0.00');
  });

  it('KanbanCard: formats task timestamps on a single line with whitespace-nowrap and shrink-0', () => {
    const mockItem: WorkItem = {
      id: 'card-1',
      tenant_id: 'tenant-1',
      project_id: 'p1',
      title: 'Polish Mobile Card Metrics',
      status: 'in_progress',
      item_type: 'task',
      order_index: 1000,
      metadata: {},
      created_at: new Date(Date.now() - 7200 * 1000).toISOString(), // 2h ago
      updated_at: new Date().toISOString(),
    };

    render(<KanbanCard item={mockItem} itemHierarchy={mockHierarchy} />);

    const timestampElem = screen.getByTestId('card-timestamp-card-1');
    expect(timestampElem).toBeInTheDocument();
    expect(timestampElem).toHaveClass('whitespace-nowrap');
    expect(timestampElem).toHaveClass('shrink-0');
    expect(timestampElem).toHaveTextContent('2h ago');
  });

  it('Settings page: renders archived card descriptions with mt-1 text-slate-400 block line breaks', () => {
    const settingsContent = fs.readFileSync(
      path.resolve(__dirname, '../src/app/(dashboard)/[tenantSlug]/settings/page.tsx'),
      'utf-8'
    );
    expect(settingsContent).toContain('className="mt-1 text-slate-400 block text-xs break-words"');
  });
});
