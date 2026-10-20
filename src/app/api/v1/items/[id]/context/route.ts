import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { generateAgentPrompt, HierarchyContextItem } from '@/lib/prompt-generator';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

/**
 * GET /api/v1/items/[id]/context
 *
 * Dynamic Agent Context & Execution Spec Route.
 * Fetches the target item, project settings, and parent item hierarchy recursively,
 * and passes them to generateAgentPrompt to synthesize instructions, constraints, and artifacts.
 *
 * Formats supported:
 *   ?format=json (default): Returns structured TaskContextSpec
 *   ?format=markdown: Returns raw prompt string ready for agent ingestion
 */
export async function GET(req: NextRequest, context: RouteContext) {
  // 1. Guard route with workspace tenant token validation
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const { tenant } = auth.context;

  const resolvedParams = await context.params;
  const targetId = resolvedParams?.id;

  if (!targetId) {
    return NextResponse.json({ error: 'Missing item identifier in path' }, { status: 400 });
  }

  // 2. Query target item (by UUID or external_ref_id)
  let itemQuery: any = supabaseAdmin
    .from('work_items')
    .select('*')
    .eq('tenant_id', tenant.id);

  if (typeof itemQuery.is === 'function') {
    itemQuery = itemQuery.is('deleted_at', null);
  }

  if (UUID_REGEX.test(targetId)) {
    itemQuery = itemQuery.eq('id', targetId);
  } else {
    itemQuery = itemQuery.eq('external_ref_id', targetId);
  }

  const { data: item, error: itemErr } = await itemQuery.maybeSingle();

  if (itemErr || !item) {
    return NextResponse.json({ error: `Work item "${targetId}" not found` }, { status: 404 });
  }

  // 3. Fetch project settings
  let projectData: any = null;
  if (item.project_id) {
    let projQuery: any = supabaseAdmin
      .from('projects')
      .select('id, slug, name, settings')
      .eq('tenant_id', tenant.id)
      .eq('id', item.project_id);

    if (typeof projQuery.is === 'function') {
      projQuery = projQuery.is('deleted_at', null);
    }

    const { data: proj } = await projQuery.maybeSingle();
    if (proj) {
      projectData = proj;
    }
  }

  // 4. Recursively fetch parent lineage
  const hierarchy: HierarchyContextItem[] = [];
  const visitedIds = new Set<string>([item.id]);
  let currentParentId = item.parent_id;

  while (currentParentId && !visitedIds.has(currentParentId)) {
    visitedIds.add(currentParentId);

    let parentQuery: any = supabaseAdmin
      .from('work_items')
      .select('id, external_ref_id, title, item_type, status, description, metadata, parent_id')
      .eq('tenant_id', tenant.id)
      .eq('id', currentParentId);

    if (typeof parentQuery.is === 'function') {
      parentQuery = parentQuery.is('deleted_at', null);
    }

    const { data: parentItem } = await parentQuery.maybeSingle();
    if (parentItem) {
      hierarchy.unshift(parentItem as HierarchyContextItem);
      currentParentId = parentItem.parent_id;
    } else {
      break;
    }
  }

  // 5. Generate agent prompt & execution spec
  const spec = generateAgentPrompt(item, {
    project: projectData
      ? {
          id: projectData.id,
          slug: projectData.slug,
          name: projectData.name,
          settings: projectData.settings,
        }
      : undefined,
    hierarchy,
  });

  // 6. Handle format query parameter
  const searchParams = req.nextUrl?.searchParams || new URL(req.url).searchParams;
  const format = searchParams.get('format') || 'json';

  if (format === 'markdown' || format === 'md' || format === 'text') {
    return new NextResponse(spec.markdown_prompt, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
      },
    });
  }

  return NextResponse.json({
    success: true,
    spec,
  });
}
