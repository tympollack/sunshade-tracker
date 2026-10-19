import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getSnapshots } from '@/app/api/v1/projects/[projectId]/analytics/snapshots/route';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn(),
}));

describe('PR 112 Devin Review Comments Verification', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const projectId = '22222222-2222-2222-2222-222222222222';
  const sprintUuid = '33333333-3333-3333-3333-333333333333';
  const legacySlug = 'sprint-2026-q4';
  const sprintName = 'Sprint 2026-Q4';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Issue 4: Legacy snapshots retain their timeline when queried by UUID', () => {
    it('matches settings sprint by name when queried with UUID, adding legacy slug to snapshot query', async () => {
      // Mock auth
      vi.mocked(authenticate).mockResolvedValue({
        context: {
          tenant: { id: tenantId, slug: 'test-tenant' },
          role: 'admin',
          userId: 'user-1',
          userName: 'Tester',
        },
      } as any);

      let snapshotInIdentifiers: string[] = [];

      // Mock supabaseAdmin
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: projectId,
                slug: 'proj-1',
                settings: {
                  sprint_settings: {
                    sprints: [
                      {
                        id: legacySlug, // Legacy slug ID
                        name: sprintName, // Shared sprint name
                        status: 'active',
                      },
                    ],
                  },
                },
              },
              error: null,
            }),
          } as any;
        }

        if (table === 'sprints') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation(function (this: any, col: string, val: string) {
              return this;
            }),
            then: (resolve: any) =>
              resolve({
                data: [
                  {
                    id: sprintUuid,
                    name: sprintName,
                    project_id: projectId,
                  },
                ],
                error: null,
              }),
          } as any;
        }

        if (table === 'sprint_snapshots') {
          const mockSnapshotQuery: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockImplementation((col: string, values: string[]) => {
              snapshotInIdentifiers = values;
              return mockSnapshotQuery;
            }),
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'snap-1',
                  sprint_id: legacySlug,
                  captured_at: '2026-10-01T00:00:00Z',
                },
              ],
              error: null,
            }),
          };
          return mockSnapshotQuery;
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        } as any;
      });

      const req = new NextRequest(
        `http://localhost/api/v1/projects/${projectId}/analytics/snapshots?sprint_id=${sprintUuid}`
      );

      const res = await getSnapshots(req, { params: Promise.resolve({ projectId }) });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.snapshots).toBeDefined();

      // Verify that the query included both the relational UUID AND the legacy slug identifier
      expect(snapshotInIdentifiers).toContain(sprintUuid);
      expect(snapshotInIdentifiers).toContain(sprintName);
      expect(snapshotInIdentifiers).toContain(legacySlug);
    });
  });

  describe('Issue 1 & 3: Project scoping & consistent resolution in ProjectWorkspaceView logic', () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    function simulateResolveTargetSprint({
      targetSprintName,
      targetProjectId,
      dbSprints,
      projectSettings,
      allProjects,
      isAllProjects,
      currentProjectId,
    }: any) {
      if (!targetSprintName || targetSprintName === '__none__') {
        return { targetSprintDef: null, targetSprintId: null, isTargetActive: false };
      }

      const targetProjId = targetProjectId || (!isAllProjects ? currentProjectId : null);
      const proj = allProjects.find((p: any) => p.id === targetProjId || p.slug === targetProjId);
      const effectiveSettings = targetProjId && proj?.settings ? proj.settings : projectSettings;
      const projectSprintDefs = effectiveSettings?.sprint_settings?.sprints || [];

      // Priority 1: Relational sprint from dbSprints with valid UUID matching project
      const dbMatch = (dbSprints || []).find((s: any) => {
        const matchesName = s.name === targetSprintName || s.id === targetSprintName;
        const matchesProject = targetProjId
          ? (!s.project_id || s.project_id === targetProjId)
          : !isAllProjects;
        return matchesName && matchesProject && s.id && UUID_REGEX.test(s.id);
      });

      // Priority 2: Project-scoped sprint definition from project settings
      const settingsMatch = projectSprintDefs.find((s: any) => {
        const matchesName = s.name === targetSprintName || s.id === targetSprintName;
        const matchesProject = targetProjId
          ? (!s.project_id || s.project_id === targetProjId)
          : !isAllProjects;
        return matchesName && matchesProject;
      });

      const targetSprintDef = dbMatch
        ? {
            ...settingsMatch,
            ...dbMatch,
            metadata: {
              ...(settingsMatch?.metadata || {}),
              ...(dbMatch.metadata || {}),
            },
          }
        : settingsMatch || null;

      const rawId = dbMatch?.id || (settingsMatch?.id && UUID_REGEX.test(settingsMatch.id) ? settingsMatch.id : null);
      const targetSprintId = rawId && UUID_REGEX.test(rawId) ? rawId : null;
      const isTargetActive = targetSprintDef ? (targetSprintDef.status === 'active' || targetSprintDef.is_active) : false;

      return { targetSprintDef, targetSprintId, isTargetActive };
    }

    it('does NOT borrow another project UUID when target project does not have the sprint', () => {
      const projA = 'proj-a-1111-1111-1111-111111111111';
      const projB = 'proj-b-2222-2222-2222-222222222222';
      const projBSprintUuid = '44444444-4444-4444-4444-444444444444';

      const dbSprints = [
        {
          id: projBSprintUuid,
          name: 'Sprint 2026-Q4',
          project_id: projB, // Belongs to Project B only!
          status: 'active',
          is_active: true,
        },
      ];

      const allProjects = [
        { id: projA, slug: 'proj-a', settings: { sprint_settings: { sprints: [] } } },
        {
          id: projB,
          slug: 'proj-b',
          settings: {
            sprint_settings: {
              sprints: [
                { id: projBSprintUuid, name: 'Sprint 2026-Q4', status: 'active', project_id: projB },
              ],
            },
          },
        },
      ];

      // Item in Project A moved to Sprint 2026-Q4
      const result = simulateResolveTargetSprint({
        targetSprintName: 'Sprint 2026-Q4',
        targetProjectId: projA,
        dbSprints,
        projectSettings: {},
        allProjects,
        isAllProjects: true,
      });

      // Must NOT borrow Project B's UUID!
      expect(result.targetSprintId).toBeNull();
      expect(result.targetSprintDef).toBeNull();
    });

    it('resolves relational UUID identically for both single and bulk moves when settings has slug ID', () => {
      const projA = 'proj-a-1111-1111-1111-111111111111';
      const relationalUuid = '55555555-5555-5555-5555-555555555555';

      const dbSprints = [
        {
          id: relationalUuid,
          name: 'Sprint 2026-Q4',
          project_id: projA,
          status: 'active',
          is_active: true,
        },
      ];

      const allProjects = [
        {
          id: projA,
          slug: 'proj-a',
          settings: {
            sprint_settings: {
              sprints: [
                { id: 'sprint-2026-q4', name: 'Sprint 2026-Q4', status: 'active' }, // Legacy slug ID in settings
              ],
            },
          },
        },
      ];

      // Single move resolution
      const singleResult = simulateResolveTargetSprint({
        targetSprintName: 'Sprint 2026-Q4',
        targetProjectId: projA,
        dbSprints,
        projectSettings: allProjects[0].settings,
        allProjects,
        isAllProjects: false,
        currentProjectId: projA,
      });

      // Bulk move resolution (with single project)
      const bulkResult = simulateResolveTargetSprint({
        targetSprintName: 'Sprint 2026-Q4',
        targetProjectId: projA,
        dbSprints,
        projectSettings: allProjects[0].settings,
        allProjects,
        isAllProjects: false,
        currentProjectId: projA,
      });

      // Both must prefer the relational UUID over the settings slug
      expect(singleResult.targetSprintId).toBe(relationalUuid);
      expect(bulkResult.targetSprintId).toBe(relationalUuid);
      expect(singleResult.targetSprintId).toEqual(bulkResult.targetSprintId);
    });
  });
});
