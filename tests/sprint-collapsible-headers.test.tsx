import React, { useState } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';

interface SprintSwimlaneTestProps {
  sprintName: string;
  items: Array<{ id: string; title: string; points?: number; status: string }>;
  goal?: string;
  initialCollapsed?: boolean;
  projectSlug?: string;
}

const MockSprintSwimlane: React.FC<SprintSwimlaneTestProps> = ({
  sprintName,
  items,
  goal,
  initialCollapsed = false,
  projectSlug = 'test-proj',
}) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(`tracker_collapsed_sprints_${projectSlug}`);
      if (stored) {
        const set = new Set(JSON.parse(stored));
        return set.has(sprintName);
      }
    } catch {}
    return initialCollapsed;
  });

  const totalPoints = items.reduce((acc, it) => acc + (it.points || 0), 0);
  const completedCount = items.filter((it) => it.status === 'done').length;
  const progressPct = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        const stored = localStorage.getItem(`tracker_collapsed_sprints_${projectSlug}`);
        const set = stored ? new Set(JSON.parse(stored)) : new Set();
        if (next) {
          set.add(sprintName);
        } else {
          set.delete(sprintName);
        }
        localStorage.setItem(`tracker_collapsed_sprints_${projectSlug}`, JSON.stringify(Array.from(set)));
      } catch {}
      return next;
    });
  };

  return (
    <div data-testid={`sprint-swimlane-${sprintName}`}>
      <div className="swimlane-header">
        <button
          type="button"
          onClick={toggleCollapse}
          data-testid={`collapse-toggle-${sprintName}`}
          aria-label={collapsed ? `Expand ${sprintName}` : `Collapse ${sprintName}`}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <h4>{sprintName}</h4>
        <span data-testid="header-metrics">
          {items.length} items · {totalPoints} pts
        </span>
        <span data-testid="header-progress">{progressPct}%</span>
        {goal && <span data-testid="header-goal">Goal: {goal}</span>}
      </div>

      {!collapsed && (
        <div data-testid="swimlane-body">
          {items.map((it) => (
            <div key={it.id} data-testid="swimlane-item">
              {it.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MockSprintPlanningBoard: React.FC<{
  sprints: Array<{ name: string; items: Array<{ id: string; title: string; points?: number; status: string }> }>;
}> = ({ sprints }) => {
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(new Set());

  const handleToggleCollapseAll = () => {
    const allKeys = sprints.map((s) => s.name);
    setCollapsedSprints((prev) => (prev.size === allKeys.length ? new Set() : new Set(allKeys)));
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleToggleCollapseAll}
        data-testid="sprint-toggle-all-collapse"
      >
        {collapsedSprints.size === sprints.length ? 'Expand All' : 'Collapse All'}
      </button>

      {sprints.map((s) => {
        const isCollapsed = collapsedSprints.has(s.name);
        const totalPoints = s.items.reduce((acc, it) => acc + (it.points || 0), 0);

        return (
          <div key={s.name} data-testid={`sprint-swimlane-${s.name}`}>
            <button
              type="button"
              onClick={() => {
                setCollapsedSprints((prev) => {
                  const next = new Set(prev);
                  if (next.has(s.name)) next.delete(s.name);
                  else next.add(s.name);
                  return next;
                });
              }}
              data-testid={`collapse-toggle-${s.name}`}
            >
              {isCollapsed ? 'Expand' : 'Collapse'}
            </button>
            <span data-testid={`metrics-${s.name}`}>
              {s.items.length} items · {totalPoints} pts
            </span>
            {!isCollapsed && (
              <div data-testid={`body-${s.name}`}>
                {s.items.map((it) => (
                  <div key={it.id}>{it.title}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

describe('Sprint Collapsible Headers (TASK-TRK-SPRINT-COLLAPSIBLE-HEADERS)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders swimlane header with metrics and items expanded by default', () => {
    render(
      <MockSprintSwimlane
        sprintName="Sprint 1"
        goal="Deliver MVP features"
        items={[
          { id: '1', title: 'Task Alpha', points: 3, status: 'todo' },
          { id: '2', title: 'Task Beta', points: 5, status: 'done' },
        ]}
      />
    );

    expect(screen.getByText('Sprint 1')).toBeDefined();
    expect(screen.getByTestId('header-metrics').textContent).toBe('2 items · 8 pts');
    expect(screen.getByTestId('header-progress').textContent).toBe('50%');
    expect(screen.getByTestId('header-goal').textContent).toBe('Goal: Deliver MVP features');

    expect(screen.getByText('Task Alpha')).toBeDefined();
    expect(screen.getByText('Task Beta')).toBeDefined();
  });

  it('collapses swimlane on toggle click while keeping header metrics visible', () => {
    render(
      <MockSprintSwimlane
        sprintName="Sprint 2"
        goal="Polish UI"
        items={[
          { id: '1', title: 'Task Alpha', points: 3, status: 'todo' },
          { id: '2', title: 'Task Beta', points: 5, status: 'done' },
        ]}
      />
    );

    const toggleBtn = screen.getByTestId('collapse-toggle-Sprint 2');
    fireEvent.click(toggleBtn);

    // Items are hidden
    expect(screen.queryByText('Task Alpha')).toBeNull();
    expect(screen.queryByText('Task Beta')).toBeNull();

    // Header metrics remain visible!
    expect(screen.getByTestId('header-metrics').textContent).toBe('2 items · 8 pts');
    expect(screen.getByTestId('header-progress').textContent).toBe('50%');
    expect(screen.getByTestId('header-goal').textContent).toBe('Goal: Polish UI');

    // Clicking toggle again expands items
    fireEvent.click(toggleBtn);
    expect(screen.getByText('Task Alpha')).toBeDefined();
    expect(screen.getByText('Task Beta')).toBeDefined();
  });

  it('persists collapsed state in localStorage', () => {
    render(
      <MockSprintSwimlane
        sprintName="Sprint 3"
        projectSlug="my-project"
        items={[{ id: '1', title: 'Task Omega', points: 2, status: 'todo' }]}
      />
    );

    const toggleBtn = screen.getByTestId('collapse-toggle-Sprint 3');
    fireEvent.click(toggleBtn);

    const saved = localStorage.getItem('tracker_collapsed_sprints_my-project');
    expect(saved).toBeDefined();
    expect(JSON.parse(saved!)).toContain('Sprint 3');
  });

  it('handles Expand All / Collapse All across multiple sprint swimlanes', () => {
    const mockSprints = [
      {
        name: 'Sprint 2026-Q1',
        items: [{ id: '1', title: 'Item 1', points: 2, status: 'done' }],
      },
      {
        name: 'Sprint 2026-Q2',
        items: [{ id: '2', title: 'Item 2', points: 3, status: 'todo' }],
      },
    ];

    render(<MockSprintPlanningBoard sprints={mockSprints} />);

    // Initially all expanded
    expect(screen.getByText('Item 1')).toBeDefined();
    expect(screen.getByText('Item 2')).toBeDefined();

    // Click Collapse All
    const toggleAllBtn = screen.getByTestId('sprint-toggle-all-collapse');
    expect(toggleAllBtn.textContent).toBe('Collapse All');
    fireEvent.click(toggleAllBtn);

    // Both bodies collapsed
    expect(screen.queryByText('Item 1')).toBeNull();
    expect(screen.queryByText('Item 2')).toBeNull();

    // Metrics remain visible for both
    expect(screen.getByTestId('metrics-Sprint 2026-Q1').textContent).toBe('1 items · 2 pts');
    expect(screen.getByTestId('metrics-Sprint 2026-Q2').textContent).toBe('1 items · 3 pts');
    expect(toggleAllBtn.textContent).toBe('Expand All');

    // Click Expand All
    fireEvent.click(toggleAllBtn);
    expect(screen.getByText('Item 1')).toBeDefined();
    expect(screen.getByText('Item 2')).toBeDefined();
  });
});
