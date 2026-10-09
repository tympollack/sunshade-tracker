import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { updateVelocitySettingsAction } from '@/app/actions/settingsActions';
import { getEstimationCalibrationTelemetry } from '@/lib/services/estimationCalibrationService';
import { GET as getCalibrationRoute } from '@/app/api/v1/statements/calibration/route';
import { getTenantEfficiencyMetrics } from '@/lib/services/valueLedgerServer';
import { VelocitySettingsPopover } from '@/components/statements/VelocitySettingsPopover';
import { ProjectFocusAccordion } from '@/components/statements/ProjectFocusAccordion';
import { supabaseAdmin } from '@/lib/db';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn().mockResolvedValue({
    context: { tenant: { id: 't-1', slug: 'pym-energy' }, userId: 'u-admin', role: 'admin' },
    errorResponse: null,
  }),
}));

describe('PR-78 Review Fixes Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Comments 9, 13, 14: updateVelocitySettingsAction Security & Error Propagation', () => {
    it('rejects anonymous caller when user session is missing (Comment 13)', async () => {
      const { createServerClient } = await import('@/lib/supabase-server');
      (createServerClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 't-1', slug: 'pym-energy', owner_id: 'u-owner' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const res = await updateVelocitySettingsAction('pym-energy', { defaultHoursPerPoint: 3.0 });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unauthorized');
    });

    it('rejects viewer workspace member from mutating settings (Comment 14)', async () => {
      const { createServerClient } = await import('@/lib/supabase-server');
      (createServerClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u-viewer' } }, error: null }),
        },
      });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 't-1', slug: 'pym-energy', owner_id: 'u-owner' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'tenant_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { role: 'viewer' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const res = await updateVelocitySettingsAction('pym-energy', { defaultHoursPerPoint: 3.0 });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Viewer role cannot modify');
    });

    it('returns error when project override update fails (Comment 9)', async () => {
      const { createServerClient } = await import('@/lib/supabase-server');
      (createServerClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u-owner' } }, error: null }),
        },
      });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 't-1', slug: 'pym-energy', owner_id: 'u-owner', settings: {} },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'p-1', settings: {} },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: { message: 'Database connection failed' } }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const res = await updateVelocitySettingsAction('pym-energy', {
        defaultHoursPerPoint: 2.5,
        projectOverrides: [{ projectId: 'p-1', velocityRatio: 3.5 }],
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Database connection failed');
    });
  });

  describe('Comment 2: Weekly Statement Project Savings Scaling (valueLedgerServer)', () => {
    it('scales projectMonths by 0.25 periodMultiplier for weekly statements', async () => {
      const mockTenant = {
        id: 't-1',
        slug: 'pym-energy',
        name: 'Pym Energy',
        tier: 'Enterprise',
      };

      const mockItems = [
        {
          id: 'item-1',
          project_id: 'proj-1',
          status: 'complete',
          created_at: '2026-10-01T10:00:00Z',
          completed_at: '2026-10-03T10:00:00Z',
        },
      ];

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: [{ id: 'proj-1', slug: 'p1', name: 'Project 1', settings: {} }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: mockItems, error: null }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const metrics = await getTenantEfficiencyMetrics('pym-energy', {
        period: 'week',
        periodMultiplier: 0.25,
        startDate: '2026-09-28T00:00:00Z',
        endDate: '2026-10-04T23:59:59Z',
      });

      // 1 project active in weekly window = 0.25 project-months * 2.0 hrs = 0.50 hrs
      const hierarchyYield = metrics.itemizedYields.find(
        (y) => y.frictionPoint === 'Hierarchical Status Rollup'
      );
      expect(hierarchyYield).toBeDefined();
      expect(hierarchyYield?.hoursReclaimed).toBe(0.5);
    });
  });

  describe('Comments 3, 4, 7, 8: estimationCalibrationService Refinements', () => {
    it('Comment 7: recognizes shipped and approved as completed in calibration', async () => {
      const mockTenant = {
        id: 't-1',
        slug: 'pym-energy',
        name: 'Pym Energy',
        settings: { velocity_conversion: { default_hours_per_point: 2.0 } },
      };

      const mockProjects = [
        { id: 'proj-1', slug: 'p1', name: 'Project 1', settings: {} },
      ];

      const mockItems = [
        {
          id: 'item-shipped',
          project_id: 'proj-1',
          parent_id: null,
          item_type: 'task',
          status: 'shipped',
          title: 'Shipped task',
          metadata: { story_points: 3 },
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-02T12:00:00Z',
        },
      ];

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: mockProjects, error: null }),
              }),
            }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({ data: mockItems, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'audit_logs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'work_item_time_logs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const payload = await getEstimationCalibrationTelemetry('pym-energy', {
        startDate: '2026-10-01T00:00:00Z',
        endDate: '2026-10-05T00:00:00Z',
      });

      expect(payload.totalPoints).toBe(3);
      expect(payload.projects[0].items[0].status).toBe('shipped');
    });

    it('Comment 4: retains isCustomRatio true when project ratio equals default ratio', async () => {
      const mockTenant = {
        id: 't-1',
        slug: 'pym-energy',
        name: 'Pym Energy',
        settings: { velocity_conversion: { default_hours_per_point: 2.0 } },
      };

      // Project explicitly configured with 2.0 (same as workspace baseline 2.0)
      const mockProjects = [
        { id: 'proj-1', slug: 'p1', name: 'Project 1', settings: { velocity_ratio: 2.0 } },
      ];

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: mockProjects, error: null }),
              }),
            }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const payload = await getEstimationCalibrationTelemetry('pym-energy', {
        startDate: '2026-10-01T00:00:00Z',
        endDate: '2026-10-05T00:00:00Z',
      });

      expect(payload.projects[0].isCustomRatio).toBe(true);
    });

    it('Comment 8: does not classify later-created planned items as churn without explicit metadata', async () => {
      const mockTenant = {
        id: 't-1',
        slug: 'pym-energy',
        name: 'Pym Energy',
        settings: { velocity_conversion: { default_hours_per_point: 2.0 } },
      };

      const mockProjects = [
        { id: 'proj-1', slug: 'p1', name: 'Project 1', settings: {} },
      ];

      // Item created 20 days into a monthly window, completed 22 days in
      const mockItems = [
        {
          id: 'item-planned',
          project_id: 'proj-1',
          parent_id: null,
          item_type: 'task',
          status: 'complete',
          title: 'Scheduled Task',
          metadata: { story_points: 5 },
          created_at: '2026-10-20T00:00:00Z',
          updated_at: '2026-10-22T00:00:00Z',
        },
      ];

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({ data: mockProjects, error: null }),
              }),
            }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({ data: mockItems, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'audit_logs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'work_item_time_logs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const payload = await getEstimationCalibrationTelemetry('pym-energy', {
        startDate: '2026-10-01T00:00:00Z',
        endDate: '2026-10-31T23:59:59Z',
      });

      const item = payload.projects[0].items[0];
      expect(item.classification).toBe('planned_scope');
      expect(item.isChurn).toBe(false);
    });
  });

  describe('Comment 6: calibration API route date expansion', () => {
    it('expands date-only end_date to end of calendar day', async () => {
      const mockTenant = {
        id: 't-1',
        slug: 'pym-energy',
        name: 'Pym Energy',
        settings: {},
      };

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/statements/calibration?start_date=2026-10-01&end_date=2026-10-05'
      );
      const res = await getCalibrationRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.dateRange.endDate).toContain('2026-10-05T23:59:59.999Z');
    });
  });

  describe('Comment 10: VelocitySettingsPopover Simulation Guard', () => {
    it('does not overwrite active slider changes when simulation preview responses update defaultRatio prop', () => {
      const onRatioSimulate = vi.fn();
      const { rerender } = render(
        <VelocitySettingsPopover
          tenantSlug="pym-energy"
          defaultRatio={2.0}
          onRatioSimulate={onRatioSimulate}
        />
      );

      // Open popover
      const triggerBtn = screen.getByTestId('velocity-settings-trigger');
      fireEvent.click(triggerBtn);

      // Increment slider
      const plusBtn = screen.getByText('+');
      fireEvent.click(plusBtn); // 2.0 -> 2.25

      // Rerender with old defaultRatio = 2.0 from background fetch while popover is open
      rerender(
        <VelocitySettingsPopover
          tenantSlug="pym-energy"
          defaultRatio={2.0}
          onRatioSimulate={onRatioSimulate}
        />
      );

      // Slider value must still be 2.25, NOT reset to 2.0
      expect(screen.getByTestId('current-baseline-value')).toHaveTextContent('2.25');
    });
  });

  describe('Comment 11: ProjectFocusAccordion defaults unrecorded projects to expanded', () => {
    it('defaults new unrecorded projects to expanded even if localStorage has existing entries', () => {
      localStorage.setItem(
        'statement_accordion_state_acme',
        JSON.stringify({ 'old-project': false })
      );

      const projects = [
        {
          projectId: 'new-project',
          projectSlug: 'new-proj',
          projectName: 'New Project',
          configuredRatio: 2.0,
          isCustomRatio: false,
          totalItems: 1,
          totalPoints: 5,
          plannedHours: 10,
          actualHours: 10,
          varianceHours: 0,
          empiricalRatio: 2.0,
          predictabilityIndex: 100,
          focusPercentage: 100,
          plannedScopePoints: 5,
          churnPoints: 0,
          items: [],
        },
      ];

      render(
        <ProjectFocusAccordion
          projects={projects}
          tenantSlug="acme"
          targetVelocityRatio={2.0}
        />
      );

      expect(screen.getByTestId('accordion-content-new-project')).toBeInTheDocument();
    });
  });
});
