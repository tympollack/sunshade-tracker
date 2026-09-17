import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { reassignWorkItemProject } from '@/app/actions/trackerActions';
import { PATCH as itemsPatchHandler } from '@/app/api/v1/items/route';
import { supabaseAdmin } from '@/lib/db';
import fs from 'fs';
import path from 'path';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-test-123', email: 'test@example.com' } },
        error: null,
      }),
    },
  }),
}));

vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn().mockResolvedValue({
    errorResponse: null,
    context: {
      user: { id: 'user-test-123', email: 'test@example.com' },
      tenant: { id: 'tenant-test-123', slug: 'sunshade' },
      apiKey: null,
    },
  }),
}));

vi.mock('@/lib/audit-log', () => ({
  recordBulkAuditLogs: vi.fn().mockResolvedValue(undefined),
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
  computeChangedFields: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/notifications', () => ({
  dispatchItemNotifications: vi.fn().mockResolvedValue(undefined),
  getTenantMemberRecipients: vi.fn().mockResolvedValue({
    resolve: vi.fn((assignee: string) => ({ id: 'resolved-id', email: `${assignee}@example.com` })),
  }),
}));

describe('TRK-09 Epic Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('BUG-TRK-REASSIGN-AUDIT-LOG-FK: Foreign key and audit log sync on project reassignment', () => {
    it('verifies DB migration script exists in sunshade-db-platform with ON UPDATE CASCADE', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        '..',
        'sunshade-db-platform',
        'supabase',
        'migrations',
        '20260917000001_fix_tracker_audit_logs_fk.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('fk_tracker_audit_logs_item');
      expect(sql).toContain('REFERENCES tracker.work_items(id)');
      expect(sql).toContain('ON DELETE CASCADE');
      expect(sql).toContain('ON UPDATE CASCADE');
      expect(sql).toContain('UPDATE tracker.audit_logs');
    });

    it('updates audit_logs project_id when reassignWorkItemProject is invoked', async () => {
      const targetItem = {
        id: 'item-root-1',
        project_id: 'proj-old',
        tenant_id: 'tenant-test-123',
        parent_id: null,
        item_type: 'task',
        status: 'not_started',
      };

      const destProject = {
        id: 'proj-new',
        slug: 'new-proj',
        name: 'New Project',
        settings: {
          hierarchy: [{ type: 'task', level: 1 }],
          statuses: [{ id: 'not_started', label: 'Not Started' }],
        },
      };

      const auditLogsUpdated: any[] = [];

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'id' && val === 'item-root-1') {
                return {
                  single: vi.fn().mockResolvedValue({ data: targetItem, error: null }),
                  maybeSingle: vi.fn().mockResolvedValue({ data: targetItem, error: null }),
                };
              }
              if (col === 'tenant_id') {
                return {
                  data: [
                    targetItem,
                    { id: 'child-1', parent_id: 'item-root-1', project_id: 'proj-old' },
                  ],
                  error: null,
                };
              }
              return { single: vi.fn().mockResolvedValue({ data: null, error: null }) };
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: destProject, error: null }),
          };
        }
        if (table === 'tenant_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
          };
        }
        if (table === 'audit_logs') {
          return {
            update: vi.fn().mockImplementation((payload: any) => ({
              in: vi.fn().mockImplementation((col: string, ids: string[]) => {
                auditLogsUpdated.push({ payload, ids });
                return {
                  eq: vi.fn().mockResolvedValue({ error: null }),
                };
              }),
            })),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const res = await reassignWorkItemProject('item-root-1', 'proj-new', 'sunshade');
      expect(res.success).toBe(true);
      expect(auditLogsUpdated.length).toBeGreaterThan(0);
      expect(auditLogsUpdated[0].payload).toEqual({ project_id: 'proj-new' });
      expect(auditLogsUpdated[0].ids).toEqual(expect.arrayContaining(['item-root-1', 'child-1']));
    });
  });

  describe('BUG-TRK-NOTIF-POPOUT-ZINDEX: Portal, elevation, and dismissal', () => {
    it('renders notification popover into document.body with z-[100] and backdrop z-[99]', async () => {
      const { render, waitFor, cleanup, fireEvent, within } = await import('@testing-library/react');
      const { NotificationBell } = await import('@/components/NotificationBell');
      cleanup();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          unread_count: 1,
          notifications: [
            {
              id: 'n1',
              tenant_id: 'tenant-test-123',
              actor_name: 'Devin',
              action: 'assigned you',
              item_title: 'Fix popout z-index',
              read: false,
              created_at: new Date().toISOString(),
            },
          ],
        }),
      });

      const { getByRole, unmount } = render(<NotificationBell tenantSlug="sunshade" />);

      const bellButton = getByRole('button', { name: /Notifications/i });
      fireEvent.click(bellButton);

      await waitFor(() => {
        const popover = within(document.body).getByTestId('notification-popover');
        expect(popover).toBeDefined();
        expect(popover.className).toContain('z-[100]');

        const backdrop = within(document.body).getByTestId('notification-backdrop');
        expect(backdrop).toBeDefined();
        expect(backdrop.className).toContain('z-[99]');
        expect(backdrop.className).toContain('backdrop-blur-sm');

        expect(document.body.contains(popover)).toBe(true);
      });
      unmount();
    });

    it('dismisses notification popover on Escape key press', async () => {
      const { render, waitFor, cleanup, fireEvent, within } = await import('@testing-library/react');
      const { NotificationBell } = await import('@/components/NotificationBell');
      cleanup();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          unread_count: 0,
          notifications: [],
        }),
      });

      const { getByRole, unmount } = render(<NotificationBell tenantSlug="sunshade" />);

      const bellButton = getByRole('button', { name: /Notifications/i });
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(within(document.body).getByTestId('notification-popover')).toBeDefined();
      });

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(within(document.body).queryByTestId('notification-popover')).toBeNull();
      });
      unmount();
    });

    it('dismisses notification popover on backdrop click', async () => {
      const { render, waitFor, cleanup, fireEvent, within } = await import('@testing-library/react');
      const { NotificationBell } = await import('@/components/NotificationBell');
      cleanup();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          unread_count: 0,
          notifications: [],
        }),
      });

      const { getByRole, unmount } = render(<NotificationBell tenantSlug="sunshade" />);

      const bellButton = getByRole('button', { name: /Notifications/i });
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(within(document.body).getByTestId('notification-backdrop')).toBeDefined();
      });

      fireEvent.click(within(document.body).getByTestId('notification-backdrop'));

      await waitFor(() => {
        expect(within(document.body).queryByTestId('notification-popover')).toBeNull();
      });
      unmount();
    });
  });
});

