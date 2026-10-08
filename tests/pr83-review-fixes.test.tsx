import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { reconcileSprintMetadata, handleBulkCreateItems, handleBulkUpdateItems } from '@/lib/bulk-items';
import { updateVelocitySettingsAction } from '@/app/actions/settingsActions';
import { ProjectSchemaView } from '@/components/schema/ProjectSchemaView';
import { StatementGenerator } from '@/components/statements/StatementGenerator';
import { supabaseAdmin } from '@/lib/db';

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

describe('PR-83 Review Fixes Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Comment 2: reconcileSprintMetadata Precedence & Ad-hoc sprint_id Preservation', () => {
    const mockSettings: any = {
      schema_version: '1.0',
      hierarchy: [{ level: 1, type: 'task', name: 'Task', label: 'Task', allowed_parents: [] }],
      statuses: [{ id: 'todo', name: 'To Do', label: 'To Do', color: '#fff', order: 0 }],
      custom_fields: [],
      sprint_settings: {
        sprints: [
          { id: 'sprint-1-uuid', name: 'Sprint 1', status: 'active' as const },
        ],
      },
    };

    it('preserves explicit sprint name when incoming specifies sprint_id: null', () => {
      const existing = {};
      const incoming = { sprint: 'Adhoc Sprint Beta', sprint_id: null };

      const result = reconcileSprintMetadata(existing, incoming, mockSettings);
      expect(result.sprint).toBe('Adhoc Sprint Beta');
      expect(result.sprint_id).toBeUndefined();
    });

    it('preserves explicit ad-hoc relational sprint_id when provided with ad-hoc sprint name', () => {
      const existing = {};
      const incoming = { sprint: 'Adhoc Sprint Beta', sprint_id: 'db-sprint-uuid-99' };

      const result = reconcileSprintMetadata(existing, incoming, mockSettings);
      expect(result.sprint).toBe('Adhoc Sprint Beta');
      expect(result.sprint_id).toBe('db-sprint-uuid-99');
    });

    it('purges both sprint and sprint_id when incoming specifies only sprint_id: null without explicit sprint', () => {
      const existing = { sprint: 'Sprint 1', sprint_id: 'sprint-1-uuid' };
      const incoming = { sprint_id: null };

      const result = reconcileSprintMetadata(existing, incoming, mockSettings);
      expect(result.sprint).toBeUndefined();
      expect(result.sprint_id).toBeUndefined();
    });
  });

  describe('Comment 6: handleBulkCreateItems allowed_story_types Validation', () => {
    it('rejects bulk item creation with 422 if item_type is not in allowed_story_types', async () => {
      const mockProject = {
        id: 'proj-1',
        slug: 'core-proj',
        settings: {
          hierarchy: [
            { level: 1, type: 'story', name: 'Story' },
            { level: 2, type: 'bug', name: 'Bug' },
          ],
          statuses: [{ id: 'not_started', name: 'Not Started' }],
          allowed_story_types: ['story'],
        },
      };

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const res = await handleBulkCreateItems(
        't-1',
        {
          items: [
            {
              title: 'Unauthorized Bug Item',
              item_type: 'bug',
              project_id: 'proj-1',
            },
          ],
        }
      );

      expect(res.success).toBe(false);
      expect(res.status).toBe(422);
      expect(res.error).toContain("item type 'bug' which is not allowed for creation");
    });
  });

  describe('Comment 9: handleBulkUpdateItems Active Sprint Estimate Immutability', () => {
    it('rejects modifying story points on items already inside an active sprint', async () => {
      const mockItem = {
        id: 'item-active-1',
        tenant_id: 't-1',
        project_id: 'proj-1',
        title: 'Active Sprint Item',
        metadata: {
          sprint: 'Sprint 1',
          sprint_id: 'sprint-1-uuid',
          story_points: 3,
        },
      };

      const mockProjectSettings = {
        sprint_settings: {
          sprints: [
            { id: 'sprint-1-uuid', name: 'Sprint 1', status: 'active' },
          ],
        },
        sprint_metrics: {
          lock_estimates_in_active_sprint: true,
        },
      };

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ data: [mockItem], error: null }),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'proj-1', settings: mockProjectSettings },
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const res = await handleBulkUpdateItems(
        't-1',
        {
          ids: ['item-active-1'],
          updates: {
            metadata: {
              story_points: 8,
            },
          },
        }
      );

      expect(res.success).toBe(false);
      expect(res.status).toBe(409);
      expect(res.error).toContain('Estimates locked while sprint is active');
    });
  });

  describe('Comment 10: updateVelocitySettingsAction Pre-flight Validation and Rollback', () => {
    it('aborts without writing when a project override does not exist in workspace', async () => {
      const { createServerClient } = await import('@/lib/supabase-server');
      (createServerClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u-admin' } }, error: null }),
        },
      });

      const updateTenantMock = vi.fn();

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 't-1', slug: 'pym-energy', owner_id: 'u-admin', settings: {} },
                    error: null,
                  }),
                }),
              }),
            }),
            update: updateTenantMock,
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const res = await updateVelocitySettingsAction('pym-energy', {
        defaultHoursPerPoint: 3.0,
        projectOverrides: [{ projectId: 'non-existent-proj', velocityRatio: 4.0 }],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Project "non-existent-proj" not found in workspace');
      // Verify tenant was NEVER updated because pre-flight check caught the missing project
      expect(updateTenantMock).not.toHaveBeenCalled();
    });
  });

  describe('Comment 5: ProjectSchemaView Dirty State Protection', () => {
    const baseSettings: any = {
      schema_version: '1.0',
      hierarchy: [{ level: 1, type: 'task', name: 'Task' }],
      statuses: [{ id: 'todo', name: 'To Do', category: 'unstarted' }],
      custom_fields: [],
    };

    it('does not overwrite in-progress edits when external settings prop re-renders', async () => {
      const onSave = vi.fn();
      const { rerender } = render(
        <ProjectSchemaView
          projectId="proj-1"
          settings={baseSettings}
          onSave={onSave}
          initialMode="raw"
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea).toBeInTheDocument();

      // Make dirty edit
      fireEvent.change(textarea, { target: { value: '{\n  "schema_version": "2.0-dirty"\n}' } });
      expect(textarea.value).toContain('2.0-dirty');

      // Re-render with new settings from background refresh
      const refreshedSettings = { ...baseSettings, custom_fields: ['new_field'] };
      rerender(
        <ProjectSchemaView
          projectId="proj-1"
          settings={refreshedSettings}
          onSave={onSave}
          initialMode="raw"
        />
      );

      // Verify the dirty edit was NOT blown away
      expect(textarea.value).toContain('2.0-dirty');
    });

    it('switches to new project settings when projectId prop changes even if dirty', async () => {
      const onSave = vi.fn();
      const { rerender } = render(
        <ProjectSchemaView
          projectId="proj-1"
          settings={baseSettings}
          onSave={onSave}
          initialMode="raw"
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: '{\n  "schema_version": "2.0-dirty"\n}' } });

      // Change project ID
      const proj2Settings = {
        ...baseSettings,
        schema_version: 'proj-2-schema',
      };
      rerender(
        <ProjectSchemaView
          projectId="proj-2"
          settings={proj2Settings}
          onSave={onSave}
          initialMode="raw"
        />
      );

      // When switching projects, new project's settings take over
      expect(textarea.value).toContain('proj-2-schema');
    });
  });

  describe('Comment 1: StatementGenerator Simulation Does Not Reset Custom Date Range', () => {
    it('preserves custom date range when ratio simulation is triggered', async () => {
      const mockInitialData: any = {
        dateRange: { startDate: '2026-01-01', endDate: '2026-03-31', periodLabel: 'Custom Q1' },
        tenantMetrics: { totalPointsCompleted: 10, totalLoggedHours: 20 },
        projects: [],
        tenant: { slug: 'test-ws', name: 'Test WS', tier: 'Enterprise' },
        kpis: {
          completedItemsCount: 5,
          activeProjectsCount: 1,
          totalItemsCount: 10,
          totalHoursReclaimed: 40.5,
          hourlyRate: 150,
          velocityFactor: '2.0x',
          grossRealizedValue: 6075,
          platformSubscriptionFee: 500,
          netRealizedSavings: 5575,
        },
        itemizedYields: [],
        ecosystemNote: 'Note',
        generatedAt: '2026-01-01T00:00:00.000Z',
      };

      // Mock global fetch
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/statements/calibration')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                tenantSlug: 'test-ws',
                defaultVelocityRatio: 2.0,
                projects: [],
              }),
          });
        }
        if (url.includes('/api/v1/statements')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockInitialData),
          });
        }
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      });
      global.fetch = mockFetch;

      render(
        <StatementGenerator
          tenantSlug="test-ws"
          initialData={mockInitialData}
        />
      );

      // Switch to custom timeframe
      fireEvent.click(screen.getByTestId('timeframe-btn-custom'));

      const startInput = screen.getByTestId('custom-start-date') as HTMLInputElement;
      const endInput = screen.getByTestId('custom-end-date') as HTMLInputElement;

      fireEvent.change(startInput, { target: { value: '2026-02-01' } });
      fireEvent.change(endInput, { target: { value: '2026-02-28' } });
      expect(startInput.value).toBe('2026-02-01');

      // Simulate ratio popover trigger
      const velocityBtn = screen.getByTestId('velocity-settings-trigger');
      fireEvent.click(velocityBtn);

      const toggle = screen.getByTestId('simulate-ratio-toggle');
      fireEvent.click(toggle);

      const slider = screen.getByTestId('baseline-ratio-slider');
      fireEvent.change(slider, { target: { value: '4.5' } });

      // Verify date inputs are still intact and NOT reset to current month
      await waitFor(() => {
        expect(startInput.value).toBe('2026-02-01');
        expect(endInput.value).toBe('2026-02-28');
      });
    });
  });
});
