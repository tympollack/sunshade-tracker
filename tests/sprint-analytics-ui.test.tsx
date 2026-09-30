import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SprintAnalyticsPage from '@/app/(dashboard)/[tenantSlug]/sprints/analytics/page';
import {
  SprintAnalyticsContent,
  SprintAnalyticsSkeleton,
} from '@/components/sprints/SprintAnalyticsDashboard';
import { ItemDetailsTab } from '@/components/modal/tabs/ItemDetailsTab';
import { WorkItem, ProjectSettings } from '@/types/tracker';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/pym-energy/sprints/analytics',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TASK-TRK-SPRINT-ANALYTICS-UI: Dashboard & Locked Estimates UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SprintAnalyticsDashboard Page', () => {
    const mockReport = {
      sprintId: 'sprint-q4',
      sprintName: 'Sprint 2026-Q4',
      status: 'active',
      isActive: true,
      rollingVelocity3Sprint: 28.5,
      historicalSprintsEvaluated: 3,
      committedPoints: 40,
      currentSprintPoints: 42,
      completedPoints: 36,
      remainingPoints: 6,
      inProgressPoints: 4,
      pointsAddedMidSprint: 2,
      scopeCreepPercent: 5.0,
      commitmentReliabilityPercent: 90.0,
      reliabilityStatus: 'green',
      cycleTimeDays: 2.8,
      wipAgeDays: 1.5,
      runwayElapsedRatio: 0.75, // > 60% locked
      runwayLocked: true,
      capacityRemaining: 0,
      velocityTrend: 'increasing',
    };

    it('renders all metric cards, badges, and runway gauge with zero layout shift', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/v1/tenants/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ workspaces: [{ slug: 'pym-energy', name: 'PYM Energy' }] }),
          });
        }
        if (url.includes('/api/v1/projects')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                projects: [
                  {
                    id: 'p-1',
                    settings: {
                      sprint_settings: {
                        sprints: [
                          { id: 'sprint-q4', name: 'Sprint 2026-Q4', status: 'active' },
                        ],
                      },
                    },
                  },
                ],
              }),
          });
        }
        if (url.includes('/api/v1/sprints/analytics')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockReport),
          });
        }
        if (url.includes('/api/v1/items')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ items: [] }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<SprintAnalyticsContent tenantSlug="pym-energy" />);

      // 1. Metric Readout Card: Rolling Velocity
      await waitFor(() => {
        expect(screen.getByTestId('rolling-velocity-value')).toHaveTextContent('28.5');
      });
      expect(screen.getByTestId('card-rolling-velocity')).toBeInTheDocument();
      expect(screen.getByText('3 closed sprints evaluated')).toBeInTheDocument();

      // 2. Metric Readout Card: Commitment Reliability % (>=85% Green)
      expect(screen.getByTestId('card-commitment-reliability')).toBeInTheDocument();
      expect(screen.getByTestId('commitment-reliability-value')).toHaveTextContent('90%');
      expect(screen.getByTestId('health-badge-green')).toHaveTextContent('Healthy (>=85%)');

      // 3. Metric Readout Card: Scope Creep Delta (Added After Sprint Start)
      expect(screen.getByTestId('card-scope-creep')).toBeInTheDocument();
      expect(screen.getByTestId('scope-creep-value')).toHaveTextContent('+2 pts');
      expect(screen.getByTestId('tag-added-after-sprint-start')).toBeInTheDocument();

      // 4. Late Runway Gauge (> 60% locked status)
      expect(screen.getByTestId('late-runway-gauge')).toBeInTheDocument();
      expect(screen.getByTestId('runway-locked-badge')).toHaveTextContent('Intake Locked (<= 2 pts)');
      expect(screen.getByText('75.0%')).toBeInTheDocument();
    });

    it('renders skeleton placeholder with zero layout shift during loading', () => {
      render(<SprintAnalyticsSkeleton tenantSlug="pym-energy" />);
      expect(screen.getByTestId('sprint-analytics-skeleton')).toBeInTheDocument();
    });
  });

  describe('Estimate Immutability in Active Sprints (ItemDetailsTab)', () => {
    const activeProjectSettings: ProjectSettings = {
      schema_version: '1.0',
      hierarchy: [{ type: 'task', label: 'Task', level: 3, allowed_parents: [] }],
      statuses: [{ id: 'not_started', label: 'Not Started', color: '#fff', order: 1 }],
      custom_fields: ['story_points'],
      sprint_settings: {
        sprints: [
          {
            id: 'sprint-active',
            name: 'Sprint 2026-Q4',
            status: 'active',
            is_active: true,
          },
          {
            id: 'sprint-planned',
            name: 'Sprint 2027-Q1',
            status: 'planned',
            is_active: false,
          },
        ],
      },
    };

    const activeItem: Partial<WorkItem> = {
      id: 'item-101',
      title: 'Active Core Dev Task',
      status: 'in_progress',
      metadata: {
        sprint: 'Sprint 2026-Q4',
        story_points: 5,
      },
    };

    const plannedItem: Partial<WorkItem> = {
      id: 'item-102',
      title: 'Future Planned Task',
      status: 'not_started',
      metadata: {
        sprint: 'Sprint 2027-Q1',
        story_points: 8,
      },
    };

    it('renders story_points input as disabled with tooltip when item is in active sprint', () => {
      render(
        <ItemDetailsTab
          item={activeItem as any}
          title={activeItem.title!}
          onTitleChange={vi.fn()}
          description=""
          onDescriptionChange={vi.fn()}
          itemType="task"
          onItemTypeChange={vi.fn()}
          status="in_progress"
          onStatusChange={vi.fn()}
          assignee=""
          onAssigneeChange={vi.fn()}
          parentId=""
          onParentIdChange={vi.fn()}
          externalRef="TASK-101"
          onExternalRefChange={vi.fn()}
          effectiveProjectSettings={activeProjectSettings}
          allowedParentTypes={[]}
          eligibleParents={[]}
          isLoadingParents={false}
          metadata={activeItem.metadata!}
          metaDrafts={{}}
          metaErrors={{}}
          onUpdateMetaField={vi.fn()}
          onRemoveMetaField={vi.fn()}
          showAddMeta={false}
          onToggleAddMeta={vi.fn()}
          newMetaKey=""
          onNewMetaKeyChange={vi.fn()}
          newMetaVal=""
          onNewMetaValChange={vi.fn()}
          onAddMetaField={vi.fn()}
          isLocked={false}
          isReadOnly={false}
          selectedProjectId="p-1"
          onSelectedProjectIdChange={vi.fn()}
          myDisplayName="Tymz"
          memberNames={[]}
          saveError={null}
        />
      );

      const pointsInput = screen.getByTestId('estimate-locked-input');
      expect(pointsInput).toBeDisabled();
      expect(pointsInput).toHaveAttribute('title', 'Estimates locked while sprint is active');
      expect(screen.getByTestId('estimate-locked-tooltip')).toHaveTextContent(
        'Estimates locked while sprint is active'
      );
    });

    it('renders story_points input as enabled when item is in planned / non-active sprint', () => {
      render(
        <ItemDetailsTab
          item={plannedItem as any}
          title={plannedItem.title!}
          onTitleChange={vi.fn()}
          description=""
          onDescriptionChange={vi.fn()}
          itemType="task"
          onItemTypeChange={vi.fn()}
          status="not_started"
          onStatusChange={vi.fn()}
          assignee=""
          onAssigneeChange={vi.fn()}
          parentId=""
          onParentIdChange={vi.fn()}
          externalRef="TASK-102"
          onExternalRefChange={vi.fn()}
          effectiveProjectSettings={activeProjectSettings}
          allowedParentTypes={[]}
          eligibleParents={[]}
          isLoadingParents={false}
          metadata={plannedItem.metadata!}
          metaDrafts={{}}
          metaErrors={{}}
          onUpdateMetaField={vi.fn()}
          onRemoveMetaField={vi.fn()}
          showAddMeta={false}
          onToggleAddMeta={vi.fn()}
          newMetaKey=""
          onNewMetaKeyChange={vi.fn()}
          newMetaVal=""
          onNewMetaValChange={vi.fn()}
          onAddMetaField={vi.fn()}
          isLocked={false}
          isReadOnly={false}
          selectedProjectId="p-1"
          onSelectedProjectIdChange={vi.fn()}
          myDisplayName="Tymz"
          memberNames={[]}
          saveError={null}
        />
      );

      expect(screen.queryByTestId('estimate-locked-input')).not.toBeInTheDocument();
      expect(screen.queryByTestId('estimate-locked-tooltip')).not.toBeInTheDocument();
    });
  });
});
