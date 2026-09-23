import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { aggregateSprintBurndown } from '@/lib/analytics/burndown-aggregator';
import { WorkItem, Project } from '@/types/tracker';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: projects, error: projErr } = await supabaseAdmin
      .from('projects')
      .select('id, slug, name, settings')
      .is('deleted_at', null);

    if (projErr) {
      return NextResponse.json({ error: projErr.message }, { status: 500 });
    }

    const rollups: Array<{
      projectId: string;
      projectSlug: string;
      sprintName: string;
      metrics: ReturnType<typeof aggregateSprintBurndown>;
    }> = [];

    const todayStr = new Date().toISOString().split('T')[0];

    for (const proj of (projects as unknown as Project[]) || []) {
      const sprints = proj.settings?.sprint_settings?.sprints || [];
      const activeSprints = sprints.filter((s) => s.status === 'active' || s.is_current);

      if (activeSprints.length === 0) continue;

      const { data: rawItems, error: itemsErr } = await supabaseAdmin
        .from('work_items')
        .select('*')
        .eq('project_id', proj.id)
        .is('deleted_at', null);

      if (itemsErr || !rawItems) continue;

      const items = rawItems as unknown as WorkItem[];

      for (const sprint of activeSprints) {
        const sprintItems = items.filter((it) => it.metadata?.sprint === sprint.name);
        const metrics = aggregateSprintBurndown(sprintItems, todayStr, proj.settings?.statuses);

        rollups.push({
          projectId: proj.id,
          projectSlug: proj.slug,
          sprintName: sprint.name,
          metrics,
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      rollupsCount: rollups.length,
      rollups,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}

