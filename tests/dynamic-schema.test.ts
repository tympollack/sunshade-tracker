import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getSettingsHandler, PUT as putSettingsHandler } from '@/app/api/v1/projects/[projectId]/settings/route';
import { supabaseAdmin } from '@/lib/db';

vi.mock('@/lib/db', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

describe('Dynamic Schema Settings Endpoint (/api/v1/projects/[projectId]/settings)', () => {
  const mockTenant = { id: '00000000-0000-0000-0000-000000000000', slug: 'sunshade' };
  const mockProject = {
    id: 'proj-123',
    tenant_id: mockTenant.id,
    slug: 'portfolio',
    name: 'Portfolio Project',
    settings: {
      schema_version: '1.0',
      hierarchy: [
        { type: 'project', label: 'Project', level: 1, allowed_parents: [] },
        { type: 'epic', label: 'Epic', level: 2, allowed_parents: ['project'] },
        { type: 'story', label: 'Story', level: 3, allowed_parents: ['epic'] },
        { type: 'task', label: 'Task', level: 4, allowed_parents: ['story', 'epic'] },
      ],
      statuses: [
        { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
        { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      ],
      custom_fields: ['priority', 'complexity', 'timeline'],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export project settings JSON schema', async () => {
    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            })),
          })),
        } as any;
      }
      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
              })),
            })),
          })),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/portfolio/settings', {
      headers: { Authorization: 'Bearer tk_live_sunshade_master_key' },
    });

    const res = await getSettingsHandler(req, {
      params: Promise.resolve({ projectId: 'portfolio' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.project_slug).toBe('portfolio');
    expect(json.settings.schema_version).toBe('1.0');
    expect(json.settings.hierarchy).toHaveLength(4);
    expect(json.settings.statuses).toHaveLength(2);
  });

  it('should reject invalid schema update payload lacking required arrays', async () => {
    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            })),
          })),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/portfolio/settings', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ settings: { invalid_key: true } }),
    });

    const res = await putSettingsHandler(req, {
      params: Promise.resolve({ projectId: 'portfolio' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid settings payload');
  });

  it('should update settings successfully when payload is valid with automations and templates', async () => {
    const validSettings = {
      ...mockProject.settings,
      automations: [
        {
          trigger: { type: 'item_created' },
          actions: [{ type: 'apply_template', target: 'tmpl-welcome' }],
        },
      ],
      templates: [
        {
          id: 'tmpl-welcome',
          actions: [{ type: 'set_status', target: 'not_started' }],
        },
      ],
    };

    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            })),
          })),
        } as any;
      }
      if (table === 'projects') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { ...mockProject, settings: validSettings },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/portfolio/settings', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ settings: validSettings }),
    });

    const res = await putSettingsHandler(req, {
      params: Promise.resolve({ projectId: 'portfolio' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.project.settings.automations).toHaveLength(1);
  });

  it('should reject settings update with 422 if automation trigger is malformed', async () => {
    const invalidSettings = {
      ...mockProject.settings,
      automations: [
        {
          // malformed trigger lacking type
          trigger: {},
          actions: [{ type: 'apply_template', target: 'tmpl-1' }],
        },
      ],
    };

    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            })),
          })),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/portfolio/settings', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ settings: invalidSettings }),
    });

    const res = await putSettingsHandler(req, {
      params: Promise.resolve({ projectId: 'portfolio' }),
    });

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain('Unprocessable Entity');
    expect(json.errors).toBeDefined();
    expect(json.errors.some((e: any) => e.path.includes('automations[0].trigger'))).toBe(true);
  });

  it('should reject settings update with 422 if template action target is missing', async () => {
    const invalidSettings = {
      ...mockProject.settings,
      automations: [
        {
          trigger: { type: 'item_created' },
          // Missing target for apply_template action
          actions: [{ type: 'apply_template' }],
        },
      ],
    };

    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            })),
          })),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/portfolio/settings', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ settings: invalidSettings }),
    });

    const res = await putSettingsHandler(req, {
      params: Promise.resolve({ projectId: 'portfolio' }),
    });

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain('Unprocessable Entity');
    expect(json.errors).toBeDefined();
    expect(json.errors.some((e: any) => e.path.includes('automations[0].actions[0].target'))).toBe(true);
  });
});

