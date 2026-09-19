import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PointModeSwitcher } from '@/components/PointModeSwitcher';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { SprintHeader } from '@/components/sprint/SprintHeader';
import { WorkItem } from '@/types/tracker';

describe('FEAT-TRK-MACRO-VS-LEAF-VIEW-TOGGLE: Point Mode Switcher & View Toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders segmented control with Macro (Top-Level) and Granular (Leaf) options', () => {
    const onChange = vi.fn();
    render(<PointModeSwitcher mode="granular" onChange={onChange} />);

    const switcher = screen.getByTestId('point-mode-switcher');
    expect(switcher).toBeInTheDocument();

    const granularBtn = screen.getByTestId('point-mode-granular-btn');
    const macroBtn = screen.getByTestId('point-mode-macro-btn');

    expect(granularBtn).toHaveTextContent('Granular (Leaf)');
    expect(macroBtn).toHaveTextContent('Macro (Top-Level)');

    // Granular is active
    expect(granularBtn).toHaveAttribute('aria-pressed', 'true');
    expect(macroBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange when user toggles mode', () => {
    const onChange = vi.fn();
    render(<PointModeSwitcher mode="granular" onChange={onChange} />);

    const macroBtn = screen.getByTestId('point-mode-macro-btn');
    fireEvent.click(macroBtn);

    expect(onChange).toHaveBeenCalledWith('macro');
  });

  it('SprintHeader displays true burn in granular mode and roadmap capacity in macro mode', () => {
    const items: WorkItem[] = [
      {
        id: 'epic-1',
        tenant_id: 't-1',
        project_id: 'p-1',
        parent_id: null,
        title: 'Epic',
        item_type: 'epic',
        status: 'in_progress',
        order_index: 1000,
        metadata: { story_points: 13 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'task-1',
        tenant_id: 't-1',
        project_id: 'p-1',
        parent_id: 'epic-1',
        title: 'Task 1',
        item_type: 'task',
        status: 'in_progress',
        order_index: 2000,
        metadata: { story_points: 4 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    // Granular mode: bottom-most leaf = 4 pts true burn
    const { rerender } = render(
      <SprintHeader sprintName="Sprint 2026-Q3" items={items} pointMode="granular" />
    );

    const pointsBadge = screen.getByTestId('sprint-header-points');
    expect(pointsBadge).toHaveTextContent('4 pts true burn');

    // Macro mode: top-level epic = 13 pts roadmap capacity
    rerender(
      <SprintHeader sprintName="Sprint 2026-Q3" items={items} pointMode="macro" />
    );
    expect(pointsBadge).toHaveTextContent('13 pts roadmap capacity');
  });

  it('MobileBottomNav exposes PointModeSwitcher in mobile tools drawer for Board & Tree', () => {
    const onTabChange = vi.fn();
    const onPointModeChange = vi.fn();

    const { rerender } = render(
      <MobileBottomNav
        activeTab="board"
        onTabChange={onTabChange}
        pointMode="granular"
        onPointModeChange={onPointModeChange}
      />
    );

    // Open tools menu
    const toolsBtn = screen.getByTestId('mobile-nav-tools');
    fireEvent.click(toolsBtn);

    const drawerSection = screen.getByTestId('mobile-point-mode-drawer-section');
    expect(drawerSection).toBeInTheDocument();

    const macroBtn = screen.getByTestId('point-mode-macro-btn');
    fireEvent.click(macroBtn);
    expect(onPointModeChange).toHaveBeenCalledWith('macro');
  });
});
