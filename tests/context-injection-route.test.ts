import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getContextHandler } from '@/app/api/v1/items/[id]/context/route';
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

describe('TASK-TRK-CONTEXT-INJECTION: Dynamic Agent Context & Execution Spec Route', () => {
  const mockTenant = { id: '00000000-0000-0000-0000-000000000000', slug: 'pym-energy' };

  const mockEpic = {
    id: 'epic-1000',
    tenant_id: mockTenant.id,
    project_id: 'proj-1',
    parent_id: null,
    external_ref_id: 'EPIC-ARCH',
    item_type: 'epic',
    title: 'Agent Infrastructure Architecture',
    status: 'in_progress',
    description: 'Core architectural foundation for agent execution',
    metadata: {},
  };

  const mockStory = {
    id: 'story-2000',
    tenant_id: mockTenant.id,
    project_id: 'proj-1',
    parent_id: 'epic-1000',
    external_ref_id: 'STORY-AGENT',
    item_type: 'story',
    title: 'Autonomous Worker Lifecycle',
    status: 'in_progress',
    description: 'Worker lifecycle controls',
    metadata: {},
  };

  const mockTask = {
    id: 'task-3000',
    tenant_id: mockTenant.id,
    project_id: 'proj-1',
    parent_id: 'story-2000',
    external_ref_id: 'TASK-CTX-INJECT',
    item_type: 'task',
    title: 'Implement Context Route',
    status: 'not_started',
    description: 'Expose agent execution context',
    metadata: {
      agent_prompt: '### SYSTEM ROLE: Agent Context Architect\nExpose hierarchical prompt.',
      acceptance_criteria: ['Returns 200 with lineage', 'Returns 401 on missing token'],
      commit_hash: 'c0ffee1234',
      pr_url: 'https://github.com/org/repo/pull/55',
    },
  };

  const mockProject = {
    id: 'proj-1',
    slug: 'sunshade-tracker',
    name: 'SunShade Tracker',
    settings: {
      hierarchy: [{ type: 'epic' }, { type: 'story' }, { type: 'task' }],
    },
  };

  function createMockQueryBuilder(itemsMap: Record<string, any>, projectData: any = null) {
    return (table: string) => {
      let currentFilter: { id?: string; external_ref_id?: string } = {};

      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((field: string, val: string) => {
          if (field === 'id') currentFilter.id = val;
          if (field === 'external_ref_id') currentFilter.external_ref_id = val;
          return builder;
        }),
        is: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          if (table === 'projects') {
            return { data: projectData, error: null };
          }
          if (table === 'work_items') {
            const key = currentFilter.id || currentFilter.external_ref_id;
            const found = key ? itemsMap[key] : null;
            return { data: found || null, error: null };
          }
          return { data: null, error: null };
        }),
        single: vi.fn(async () => {
          if (table === 'projects') return { data: projectData, error: null };
          const key = currentFilter.id || currentFilter.external_ref_id;
          const found = key ? itemsMap[key] : null;
          return { data: found || null, error: found ? null : new Error('Not found') };
        }),
      };

      return builder;
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthorized requests with HTTP 401', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: null,
      errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) as any,
    });

    const req = new NextRequest('https://track.sunshade.icu/api/v1/items/task-3000/context');
    const res = await getContextHandler(req, { params: Promise.resolve({ id: 'task-3000' }) });

    expect(res.status).toBe(401);
  });

  it('returns HTTP 200 with recursive parent hierarchy and markdown prompt when format=json', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: { tenant: mockTenant as any, userId: null, role: null },
      errorResponse: null,
    });

    const itemsMap: Record<string, any> = {
      'task-3000': mockTask,
      'TASK-CTX-INJECT': mockTask,
      'story-2000': mockStory,
      'STORY-AGENT': mockStory,
      'epic-1000': mockEpic,
      'EPIC-ARCH': mockEpic,
    };

    vi.mocked(supabaseAdmin.from).mockImplementation(createMockQueryBuilder(itemsMap, mockProject) as any);

    const req = new NextRequest('https://track.sunshade.icu/api/v1/items/TASK-CTX-INJECT/context?format=json');
    const res = await getContextHandler(req, { params: Promise.resolve({ id: 'TASK-CTX-INJECT' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.spec).toBeDefined();

    // Verify hierarchical ancestors
    expect(body.spec.hierarchy).toHaveLength(2);
    expect(body.spec.hierarchy[0].external_ref_id).toBe('EPIC-ARCH');
    expect(body.spec.hierarchy[1].external_ref_id).toBe('STORY-AGENT');

    // Verify metadata parsing
    expect(body.spec.agent_prompt).toContain('SYSTEM ROLE: Agent Context Architect');
    expect(body.spec.acceptance_criteria).toContain('Returns 200 with lineage');
    expect(body.spec.commit_hashes).toContain('c0ffee1234');
    expect(body.spec.pr_urls).toContain('https://github.com/org/repo/pull/55');

    // Verify markdown prompt contains breadcrumbs
    expect(body.spec.markdown_prompt).toContain('EPIC: Agent Infrastructure Architecture');
    expect(body.spec.markdown_prompt).toContain('STORY: Autonomous Worker Lifecycle');
  });

  it('returns raw markdown string when format=markdown', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: { tenant: mockTenant as any, userId: null, role: null },
      errorResponse: null,
    });

    const itemsMap: Record<string, any> = {
      'task-3000': mockTask,
      'TASK-CTX-INJECT': mockTask,
    };

    vi.mocked(supabaseAdmin.from).mockImplementation(createMockQueryBuilder(itemsMap, mockProject) as any);

    const req = new NextRequest('https://track.sunshade.icu/api/v1/items/TASK-CTX-INJECT/context?format=markdown');
    const res = await getContextHandler(req, { params: Promise.resolve({ id: 'TASK-CTX-INJECT' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const text = await res.text();
    expect(text).toContain('# Work Item Context: Implement Context Route [TASK-CTX-INJECT]');
    expect(text).toContain('SYSTEM ROLE: Agent Context Architect');
  });

  it('returns HTTP 404 when item does not exist', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: { tenant: mockTenant as any, userId: null, role: null },
      errorResponse: null,
    });

    vi.mocked(supabaseAdmin.from).mockImplementation(createMockQueryBuilder({}, null) as any);

    const req = new NextRequest('https://track.sunshade.icu/api/v1/items/NON-EXISTENT/context');
    const res = await getContextHandler(req, { params: Promise.resolve({ id: 'NON-EXISTENT' }) });

    expect(res.status).toBe(404);
  });
});
