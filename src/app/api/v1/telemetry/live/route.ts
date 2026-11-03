import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { getInFlightTelemetry, InFlightTelemetryPayload } from '@/lib/services/inFlightTelemetryService';
import { WorkItem } from '@/types/tracker';

const CACHE_CONTROL_HEADER = 'private, no-cache, stale-while-revalidate=30';
export const MAX_IDLE_POLL_AGE_MS = 5 * 60 * 1000; // 5 minutes before time-sensitive metrics must recompute

export function computeTelemetryHash(
  tenantId: string,
  view: string,
  maxItemUpdatedAt: string | null,
  maxProjectUpdatedAt: string | null,
  timeBucket: number = Math.floor(Date.now() / MAX_IDLE_POLL_AGE_MS)
): string {
  const raw = `${tenantId}:${view}:${maxItemUpdatedAt || '0'}:${maxProjectUpdatedAt || '0'}:${timeBucket}`;
  return `"${createHash('sha1').update(raw).digest('hex').slice(0, 20)}"`;
}

function buildTelemetryFingerprint(
  telemetry: InFlightTelemetryPayload,
  tenantUpdatedAt?: string | null
): string {
  const projectsKey = (telemetry.projects || [])
    .map(
      (p) =>
        `${p.project_id}:${p.wip_limit}:${p.unit_label}:${p.active_item_count}:${p.active_units}`
    )
    .join('|');
  const stagesKey = (telemetry.stages || [])
    .map((s) => `${s.stage}:${s.item_count}:${s.total_units}:${s.median_dwell_hours}`)
    .join('|');
  const radarKey = (telemetry.stage_dwell_radar || [])
    .map((r) => `${r.item_id}:${r.dwell_hours}`)
    .join('|');
  return [
    tenantUpdatedAt || '0',
    telemetry.total_active_items,
    telemetry.total_wip_capacity,
    telemetry.rolling_24h_completed_items,
    telemetry.rolling_24h_completed_units,
    telemetry.in_flight_items.length,
    projectsKey,
    stagesKey,
    radarKey,
  ].join('::');
}

/**
 * GET /api/v1/telemetry/live
 *
 * High-throughput delta query endpoint for the In-Flight Live Control Deck.
 * Supports:
 * - `?since=<ISO timestamp>` delta query corridors
 * - `?view=stage_flow|project_swimlanes`
 * - `If-None-Match` ETag and `304 Not Modified` responses when no mutations occurred
 * - `Cache-Control: private, no-cache, stale-while-revalidate=30`
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { tenant } = auth.context;

    const searchParams = req.nextUrl.searchParams;
    const sinceParam = searchParams.get('since');
    const rawView = searchParams.get('view');
    const view: 'stage_flow' | 'project_swimlanes' =
      rawView === 'project_swimlanes' ? 'project_swimlanes' : 'stage_flow';

    const ifNoneMatch = req.headers.get('if-none-match');

    // Parse since timestamp if provided
    let sinceMs: number | null = null;
    if (sinceParam && sinceParam.trim()) {
      const parsed = Date.parse(sinceParam.trim());
      if (!Number.isNaN(parsed)) {
        sinceMs = parsed;
      }
    }

    const nowMs = Date.now();
    const tenantUpdatedMs = tenant.updated_at ? Date.parse(tenant.updated_at) : NaN;
    const isFreshDeltaWindow =
      sinceMs !== null &&
      nowMs >= sinceMs &&
      nowMs - sinceMs < MAX_IDLE_POLL_AGE_MS &&
      (Number.isNaN(tenantUpdatedMs) || tenantUpdatedMs <= sinceMs);

    // Fast delta check when `since` is within the bounded freshness window
    if (sinceMs !== null && isFreshDeltaWindow) {
      const sinceIso = new Date(sinceMs).toISOString();

      let mutatedItemsQuery: any = supabaseAdmin
        .from('work_items')
        .select('id, updated_at, deleted_at')
        .eq('tenant_id', tenant.id)
        .gt('updated_at', sinceIso)
        .order('updated_at', { ascending: false })
        .limit(50);

      let mutatedProjectsQuery: any = supabaseAdmin
        .from('projects')
        .select('id, updated_at')
        .eq('tenant_id', tenant.id)
        .gt('updated_at', sinceIso)
        .order('updated_at', { ascending: false })
        .limit(10);

      const [mutatedItemsRes, mutatedProjectsRes] = await Promise.all([
        mutatedItemsQuery,
        mutatedProjectsQuery,
      ]);

      const mutatedItems = mutatedItemsRes?.data || [];
      const mutatedProjects = mutatedProjectsRes?.data || [];

      if (mutatedItems.length === 0 && mutatedProjects.length === 0) {
        const idleEtag = computeTelemetryHash(
          tenant.id,
          view,
          sinceIso,
          tenant.updated_at || sinceIso,
          Math.floor(nowMs / MAX_IDLE_POLL_AGE_MS)
        );
        return new NextResponse(null, {
          status: 304,
          headers: {
            'Cache-Control': CACHE_CONTROL_HEADER,
            ETag: ifNoneMatch || idleEtag,
          },
        });
      }
    }

    // Compute fresh InFlightTelemetryPayload
    const telemetry: InFlightTelemetryPayload = await getInFlightTelemetry(tenant.slug, {
      nowMs,
    });

    // Compute deterministic ETag from active in-flight items, project configs, and time bucket
    let maxItemUpdated = '';
    for (const it of telemetry.in_flight_items) {
      if (it.updated_at && it.updated_at > maxItemUpdated) {
        maxItemUpdated = it.updated_at;
      }
    }

    const fingerprint = buildTelemetryFingerprint(telemetry, tenant.updated_at);
    const etag = computeTelemetryHash(
      tenant.id,
      view,
      maxItemUpdated || '0',
      fingerprint,
      Math.floor(nowMs / MAX_IDLE_POLL_AGE_MS)
    );

    if (ifNoneMatch && ifNoneMatch === etag && sinceMs !== null) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'Cache-Control': CACHE_CONTROL_HEADER,
          ETag: etag,
        },
      });
    }

    // If `since` was provided, also include explicit delta_items and deleted_ids
    let deltaItems: WorkItem[] = telemetry.in_flight_items;
    const deletedIds: string[] = [];

    if (sinceMs !== null) {
      deltaItems = telemetry.in_flight_items.filter((it) => {
        const ts = Date.parse(it.updated_at || '');
        return !Number.isNaN(ts) && ts > sinceMs!;
      });

      try {
        const sinceIso = new Date(sinceMs).toISOString();
        const { data: tombstones } = await supabaseAdmin
          .from('work_items')
          .select('id, deleted_at, updated_at')
          .eq('tenant_id', tenant.id)
          .gt('updated_at', sinceIso)
          .not('deleted_at', 'is', null);

        if (Array.isArray(tombstones)) {
          for (const t of tombstones) {
            if (t?.id) deletedIds.push(t.id);
          }
        }
      } catch {
        // Safe fallback if tombstone query is not supported in mock
      }
    }

    return NextResponse.json(
      {
        view,
        is_delta: sinceMs !== null,
        telemetry,
        delta_items: deltaItems,
        deleted_ids: deletedIds,
        synced_at: telemetry.synced_at,
        etag,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': CACHE_CONTROL_HEADER,
          ETag: etag,
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
