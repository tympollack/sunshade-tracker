import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/db';
import { getSprintHealthReport } from '@/lib/services/sprintAnalyticsServer';

/**
 * GET /api/v1/sprints/analytics?sprint_id=...
 *
 * Query rolling 3-sprint velocity, scope churn factor, commitment predictability,
 * and cycle lead times for an enterprise sprint.
 * If ?sprint_id is omitted, returns available sprints for the project/tenant.
 *
 * Supports:
 * - Query param `?sprint_id=...` or `?sprint_name=...`
 * - Dual authentication (Supabase session token or Bearer API key)
 * - Strict multi-tenant isolation
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Dual authentication (session cookies or Bearer API key)
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;

    const { tenant } = auth.context;
    const { searchParams } = new URL(req.url);

    // Multi-tenant check
    const tenantSlugParam = searchParams.get('tenant_slug') || req.headers.get('x-tenant-slug');
    const targetSlug = tenantSlugParam || tenant.slug;

    if (targetSlug !== tenant.slug) {
      return NextResponse.json(
        { error: `Unauthorized: You do not have permission to access workspace '${targetSlug}'.` },
        { status: 403 }
      );
    }

    const sprintId =
      searchParams.get('sprint_id') ||
      searchParams.get('sprint_name') ||
      searchParams.get('sprint');

    const projectIdOrSlug =
      searchParams.get('project_id') ||
      searchParams.get('project_slug') ||
      searchParams.get('project');

    if (!sprintId) {
      const sprintOptions: Array<{
        id: string;
        name: string;
        is_active: boolean;
        status?: string;
        started_at?: string | null;
        ends_at?: string | null;
        start_date?: string | null;
        end_date?: string | null;
        project_id?: string | null;
      }> = [];

      let targetProjectId: string | null = null;
      if (projectIdOrSlug && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectIdOrSlug)) {
        targetProjectId = projectIdOrSlug;
      }

      let projData: any[] = [];
      try {
        let projQuery = supabaseAdmin
          .from('projects')
          .select('id, slug, settings')
          .eq('tenant_id', tenant.id)
          .is('deleted_at', null);

        if (projectIdOrSlug) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectIdOrSlug);
          if (isUuid) {
            projQuery = projQuery.eq('id', projectIdOrSlug);
          } else {
            projQuery = projQuery.eq('slug', projectIdOrSlug);
          }
        }

        const pRes = await projQuery;
        projData = pRes.data || [];
        if (projData.length > 0 && !targetProjectId) {
          targetProjectId = projData[0].id || null;
        }
      } catch {
        // Project settings fallback
      }

      try {

        let sprintQuery: any = supabaseAdmin
          .from('sprints')
          .select('id, name, status, is_active, started_at, ends_at, committed_points, project_id')
          .eq('tenant_id', tenant.id);

        if (targetProjectId && typeof sprintQuery.eq === 'function') {
          try {
            const filtered = sprintQuery.eq('project_id', targetProjectId);
            if (filtered && typeof filtered.then === 'function') {
              sprintQuery = filtered;
            }
          } catch {
            // Keep base query if chaining not supported on mock
          }
        }

        const { data: dbSprints } = await sprintQuery;
        if (dbSprints && Array.isArray(dbSprints)) {
          for (const s of dbSprints) {
            if (targetProjectId && s.project_id && s.project_id !== targetProjectId) {
              continue;
            }
            sprintOptions.push({
              id: s.id || s.name,
              name: s.name,
              is_active: Boolean(s.is_active || s.status === 'active' || s.status === 'in_progress'),
              status: s.status,
              started_at: s.started_at || null,
              ends_at: s.ends_at || null,
              project_id: s.project_id || null,
            });
          }
        }
      } catch {
        // Table query fallback
      }

      try {
        for (const p of projData || []) {
          const settingsSprints = p.settings?.sprint_settings?.sprints || [];
          for (const s of settingsSprints) {
            if (!sprintOptions.some((ex) => ex.id === (s.id || s.name) || ex.name === s.name)) {
              sprintOptions.push({
                id: s.id || s.name,
                name: s.name,
                is_active: Boolean(s.is_active || s.status === 'active' || s.is_current),
                status: s.status,
                start_date: s.start_date || s.startDate || null,
                end_date: s.end_date || s.endDate || null,
                project_id: p.id,
              });
            }
          }
        }
      } catch {
        // Project settings fallback
      }

      return NextResponse.json({ sprints: sprintOptions }, { status: 200 });
    }

    const report = await getSprintHealthReport(targetSlug, sprintId, projectIdOrSlug);

    return NextResponse.json(report, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to retrieve sprint analytics telemetry' },
      { status: 500 }
    );
  }
}
