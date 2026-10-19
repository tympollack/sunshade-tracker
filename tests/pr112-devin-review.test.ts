import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getSnapshots } from '@/app/api/v1/projects/[projectId]/analytics/snapshots/route';
import { resolveTargetSprint } from '@/lib/sprint-resolver';
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

describe('PR 112 & 113 Devin Review Comments Verification', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const projectId = '22222222-2222-2222-2222-222222222222';
  const foreignProjectId = '99999999-9999-9999-9999-999999999999';
  const sprintUuid = '33333333-3333-3333-3333-333333333333';
  const foreignSprintUuid = '44444444-4444-4444-4444-444444444444';
  const legacySlug = 'sprint-2026-q4';
  const sprintName = 'Sprint 2026-Q4';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Issue 4 & PR 113 Comment 4: Snapshot timeline scoping and legacy alias expansion', () => {
    it('matches settings sprint by name when queried with project UUID, adding legacy slug to snapshot query', async () => {
      vi.mocked(authenticate).mockResolvedValue({
        context: {
          tenant: { id: tenantId, slug: 'test-tenant' },
          role: 'admin',
          userId: 'user-1',
          userName: 'Tester',
        },
      } as any);

      let snapshotInIdentifiers: string[] = [];

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
                        id: legacySlug,
                        name: sprintName,
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
            or: vi.fn().mockImplementation(function (this: any, clause: string) {
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

      expect(snapshotInIdentifiers).toContain(sprintUuid);
      expect(snapshotInIdentifiers).toContain(sprintName);
      expect(snapshotInIdentifiers).toContain(legacySlug);
    });

    it('does NOT expand local project settings alias when queried with a foreign project sprint UUID', async () => {
      vi.mocked(authenticate).mockResolvedValue({
        context: {
          tenant: { id: tenantId, slug: 'test-tenant' },
          role: 'admin',
          userId: 'user-1',
          userName: 'Tester',
        },
      } as any);

      let snapshotInIdentifiers: string[] = [];

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
                        id: legacySlug,
                        name: sprintName,
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
            or: vi.fn().mockImplementation(function (this: any, clause: string) {
              return this;
            }),
            then: (resolve: any) =>
              resolve({
                // Foreign UUID does not match this project, returns empty
                data: [],
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
              data: [],
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
        `http://localhost/api/v1/projects/${projectId}/analytics/snapshots?sprint_id=${foreignSprintUuid}`
      );

      const res = await getSnapshots(req, { params: Promise.resolve({ projectId }) });
      expect(res.status).toBe(200);

      // Must NOT contain local legacySlug or local sprintName for a foreign UUID!
      expect(snapshotInIdentifiers).not.toContain(legacySlug);
      expect(snapshotInIdentifiers).not.toContain(sprintName);
      expect(snapshotInIdentifiers).toContain(foreignSprintUuid);
    });
  });

  describe('Sprint Resolver: exported resolveTargetSprint from @/lib/sprint-resolver', () => {
    it('does NOT borrow another project UUID when target project does not have the sprint', () => {
      const projA = 'proj-a-1111-1111-1111-111111111111';
      const projB = 'proj-b-2222-2222-2222-222222222222';
      const projBSprintUuid = '44444444-4444-4444-4444-444444444444';

      const dbSprints = [
        {
          id: projBSprintUuid,
          name: 'Sprint 2026-Q4',
          project_id: projB,
          status: 'active' as const,
          is_active: true,
        },
      ];

      const allProjects = [
        { id: projA, slug: 'proj-a', settings: { sprint_settings: { sprints: [] } } as any },
        {
          id: projB,
          slug: 'proj-b',
          settings: {
            sprint_settings: {
              sprints: [
                { id: projBSprintUuid, name: 'Sprint 2026-Q4', status: 'active', project_id: projB },
              ],
            },
          } as any,
        },
      ];

      const result = resolveTargetSprint({
        targetSprintName: 'Sprint 2026-Q4',
        targetProjectId: projA,
        dbSprints: dbSprints as any,
        projectSettings: {} as any,
        allProjects,
        isAllProjects: true,
      });

      // Must NOT borrow Project B's UUID!
      expect(result.targetSprintId).toBeNull();
      expect(result.targetSprintDef).toBeNull();
    });

    it('prioritizes exact target-project sprint over global sprint with the same name (Comment 3)', () => {
      const projA = 'proj-a-1111-1111-1111-111111111111';
      const globalSprintUuid = '00000000-0000-4000-8000-000000000001';
      const projectASprintUuid = '11111111-1111-4111-8111-111111111111';

      // Global sprint precedes project sprint in dbSprints array
      const dbSprints = [
        {
          id: globalSprintUuid,
          name: 'Sprint 2026-Q4',
          project_id: null as any, // Global / workspace-wide
          status: 'planned' as const,
          is_active: false,
        },
        {
          id: projectASprintUuid,
          name: 'Sprint 2026-Q4',
          project_id: projA, // Project A's specific sprint
          status: 'active' as const,
          is_active: true,
        },
      ];

      const result = resolveTargetSprint({
        targetSprintName: 'Sprint 2026-Q4',
        targetProjectId: projA,
        dbSprints: dbSprints as any,
        projectSettings: {} as any,
        allProjects: [{ id: projA, slug: 'proj-a', settings: {} as any }],
        isAllProjects: false,
        currentProjectId: projA,
      });

      // Must select Project A's sprint UUID and active status, NOT the global sprint!
      expect(result.targetSprintId).toBe(projectASprintUuid);
      expect(result.isTargetActive).toBe(true);
    });

    it('resolves relational UUID identically for both single and bulk moves when settings has slug ID', () => {
      const projA = 'proj-a-1111-1111-1111-111111111111';
      const relationalUuid = '55555555-5555-4555-8555-555555555555';

      const dbSprints = [
        {
          id: relationalUuid,
          name: 'Sprint 2026-Q4',
          project_id: projA,
          status: 'active' as const,
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
                { id: 'sprint-2026-q4', name: 'Sprint 2026-Q4', status: 'active' },
              ],
            },
          } as any,
        },
      ];

      const singleResult = resolveTargetSprint({
        targetSprintName: 'Sprint 2026-Q4',
        targetProjectId: projA,
        dbSprints: dbSprints as any,
        projectSettings: allProjects[0].settings as any,
        allProjects,
        isAllProjects: false,
        currentProjectId: projA,
      });

      const bulkResult = resolveTargetSprint({
        targetSprintName: 'Sprint 2026-Q4',
        targetProjectId: projA,
        dbSprints: dbSprints as any,
        projectSettings: allProjects[0].settings as any,
        allProjects,
        isAllProjects: false,
        currentProjectId: projA,
      });

      expect(singleResult.targetSprintId).toBe(relationalUuid);
      expect(bulkResult.targetSprintId).toBe(relationalUuid);
      expect(singleResult.targetSprintId).toEqual(bulkResult.targetSprintId);
    });
  });
});
