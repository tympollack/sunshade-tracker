import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextRequest } from 'next/server';
import {
  computeChangedFields,
  recordAuditLog,
  getAuditLogsForItem,
} from '@/lib/audit-log';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  createInAppNotification,
  getInAppNotifications,
  markNotificationsAsRead,
  sendResendEmail,
  buildNotificationEmailHtml,
  dispatchItemNotifications,
  resolveRecipient,
  escapeHtml,
} from '@/lib/notifications';
import { GET as auditLogsGetHandler } from '@/app/api/v1/audit-logs/route';
import {
  GET as notificationsGetHandler,
  PATCH as notificationsPatchHandler,
} from '@/app/api/v1/notifications/route';
import { NotificationBell } from '@/components/NotificationBell';
import { WorkItemModal } from '@/components/WorkItemModal';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { WorkItem, ProjectSettings } from '@/types/tracker';

// Mock DB
vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

// Mock Auth Guard
vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn(),
}));

describe('Audit Logging Engine & Notifications System', () => {
  const mockTenant = { id: 'tenant-123', slug: 'sunshade-demo', name: 'SunShade Demo' };
  const mockUser = { id: 'user-456', email: 'dev@sunshade.icu', full_name: 'Dev User' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TASK-TRK-AUDIT-LOG-ENGINE: computeChangedFields & audit-log service', () => {
    it('computes field diffs correctly for status, assignee, and metadata changes', () => {
      const before: Partial<WorkItem> = {
        title: 'Original Title',
        status: 'not_started',
        assignee: null,
        metadata: { priority: 'Low' },
      };
      const after: Partial<WorkItem> = {
        title: 'Original Title',
        status: 'in_progress',
        assignee: 'tympollack',
        metadata: { priority: 'High' },
      };

      const diff = computeChangedFields(before, after);

      expect(diff.title).toBeUndefined(); // Unchanged
      expect(diff.status).toEqual({ before: 'not_started', after: 'in_progress' });
      expect(diff.assignee).toEqual({ before: null, after: 'tympollack' });
      expect(diff.metadata).toEqual({
        before: { priority: 'Low' },
        after: { priority: 'High' },
      });
    });

    it('returns an empty diff when objects are identical', () => {
      const item: Partial<WorkItem> = {
        title: 'Same Title',
        status: 'in_progress',
        metadata: { sprint: 'Sprint 1' },
      };
      const diff = computeChangedFields(item, { ...item });
      expect(Object.keys(diff).length).toBe(0);
    });

    it('records an audit log entry in tracker.audit_logs via Supabase', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'audit-log-1',
              tenant_id: 'tenant-123',
              project_id: 'proj-123',
              item_id: 'item-123',
              action: 'update',
              changed_fields: { status: { before: 'not_started', after: 'in_progress' } },
              created_at: new Date().toISOString(),
            },
            error: null,
          }),
        }),
      });

      (supabaseAdmin.from as any).mockReturnValue({
        insert: mockInsert,
      });

      const res = await recordAuditLog({
        tenant_id: 'tenant-123',
        project_id: 'proj-123',
        item_id: 'item-123',
        actor_id: 'user-456',
        actor_name: 'Dev User',
        action: 'update',
        changed_fields: { status: { before: 'not_started', after: 'in_progress' } },
      });

      expect(res).not.toBeNull();
      expect(res?.id).toBe('audit-log-1');
      expect(mockInsert).toHaveBeenCalled();
    });

    it('handles audit log insertion errors gracefully without throwing', async () => {
      (supabaseAdmin.from as any).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Table does not exist' },
            }),
          }),
        }),
      });

      const res = await recordAuditLog({
        tenant_id: 'tenant-123',
        project_id: 'proj-123',
        item_id: 'item-123',
        action: 'create',
      });

      expect(res).toBeNull();
    });

    it('retrieves chronological audit logs for a work item', async () => {
      const mockQuery: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'log-1',
              action: 'update',
              changed_fields: { status: { before: 'not_started', after: 'in_progress' } },
            },
            {
              id: 'log-2',
              action: 'create',
              changed_fields: {},
            },
          ],
          error: null,
        }),
      };

      (supabaseAdmin.from as any).mockReturnValue(mockQuery);

      const logs = await getAuditLogsForItem('tenant-123', 'item-123');
      expect(logs.length).toBe(2);
      expect(logs[0].id).toBe('log-1');
      expect(mockQuery.eq).toHaveBeenCalledWith('tenant_id', 'tenant-123');
      expect(mockQuery.eq).toHaveBeenCalledWith('item_id', 'item-123');
    });
  });

  describe('TASK-TRK-AUDIT-LOG-ENGINE: GET /api/v1/audit-logs route', () => {
    it('requires item_id query parameter', async () => {
      (authenticate as any).mockResolvedValue({
        context: { tenant: mockTenant, userId: mockUser.id, role: 'member' },
        errorResponse: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-logs');
      const res = await auditLogsGetHandler(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('item_id');
    });

    it('returns audit logs scoped to tenant for the requested item', async () => {
      (authenticate as any).mockResolvedValue({
        context: { tenant: mockTenant, userId: mockUser.id, role: 'member' },
        errorResponse: null,
      });

      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            { id: 'log-10', item_id: 'item-10', action: 'create', changed_fields: {} },
          ],
          error: null,
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-logs?item_id=item-10');
      const res = await auditLogsGetHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.count).toBe(1);
      expect(json.audit_logs[0].id).toBe('log-10');
    });
  });

  describe('TASK-TRK-NOTIFICATIONS-CONFIG: In-App Alerts & Notifications API', () => {
    it('creates in-app notifications in tracker.notifications', async () => {
      (supabaseAdmin.from as any).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'notif-1',
                tenant_id: 'tenant-123',
                user_id: 'user-456',
                actor_name: 'Dev User',
                item_id: 'item-1',
                item_title: 'Implement notifications',
                action: 'assigned you to this item',
                read: false,
                created_at: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
      });

      const notif = await createInAppNotification({
        tenant_id: 'tenant-123',
        user_id: 'user-456',
        actor_name: 'Dev User',
        item_id: 'item-1',
        item_title: 'Implement notifications',
        action: 'assigned you to this item',
      });

      expect(notif).not.toBeNull();
      expect(notif?.id).toBe('notif-1');
      expect(notif?.read).toBe(false);
    });

    it('handles GET /api/v1/notifications and returns unread count', async () => {
      (authenticate as any).mockResolvedValue({
        context: { tenant: mockTenant, userId: mockUser.id, role: 'member' },
        errorResponse: null,
      });

      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            { id: 'n1', read: false, item_title: 'Item 1' },
            { id: 'n2', read: true, item_title: 'Item 2' },
          ],
          error: null,
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/v1/notifications');
      const res = await notificationsGetHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.count).toBe(2);
      expect(json.unread_count).toBe(1);
    });

    it('handles PATCH /api/v1/notifications to mark all notifications as read', async () => {
      (authenticate as any).mockResolvedValue({
        context: { tenant: mockTenant, userId: mockUser.id, role: 'member' },
        errorResponse: null,
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
      });

      (supabaseAdmin.from as any).mockReturnValue({
        update: mockUpdate,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ all: true }),
      });

      const res = await notificationsPatchHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({ read: true });
    });

    it('markNotificationsAsRead returns false and makes no DB update when no criteria is provided', async () => {
      const mockFrom = vi.fn();
      (supabaseAdmin.from as any) = mockFrom;

      const result = await markNotificationsAsRead('tenant-123', 'user-456', {});
      expect(result).toBe(false);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('TASK-TRK-NOTIFICATIONS-RESEND: Email Dispatcher & Preferences Filtering', () => {
    it('skips Resend email dispatch gracefully when RESEND_API_KEY is omitted', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;

      const result = await sendResendEmail({
        to: 'user@example.com',
        subject: 'Test Notification',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);

      process.env.RESEND_API_KEY = originalKey;
    });

    it('dispatches email via fetch when RESEND_API_KEY is configured', async () => {
      process.env.RESEND_API_KEY = 're_test_123456';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email-id-789' }),
      });
      global.fetch = mockFetch;

      const result = await sendResendEmail({
        to: 'dev@sunshade.icu',
        subject: 'Task Assigned',
        html: '<p>You have been assigned to this item.</p>',
      });

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('email-id-789');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer re_test_123456',
          }),
        })
      );

      delete process.env.RESEND_API_KEY;
    });

    it('builds branded HTML email with deep-link button and transition details', () => {
      const html = buildNotificationEmailHtml({
        title: 'Status Updated',
        itemTitle: 'Audit Logging Feature',
        externalRefId: 'TASK-101',
        actorName: 'Tym Pollack',
        actionText: 'changed status to in_progress',
        detailsHtml: '<p>Status: not_started → in_progress</p>',
        deepLinkUrl: 'https://track.sunshade.icu/sunshade/all?item=123',
      });

      expect(html).toContain('SUNSHADE TRACKER');
      expect(html).toContain('TASK-101');
      expect(html).toContain('Audit Logging Feature');
      expect(html).toContain('Tym Pollack');
      expect(html).toContain('https://track.sunshade.icu/sunshade/all?item=123');
      expect(html).toContain('View Work Item');
    });

    it('dispatchItemNotifications triggers notifications when item status changes', async () => {
      (supabaseAdmin.from as any).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'notif-status-1', read: false },
              error: null,
            }),
          }),
        }),
      });

      const item: WorkItem = {
        id: 'item-100',
        tenant_id: 'tenant-123',
        project_id: 'proj-123',
        title: 'Feature Item',
        item_type: 'task',
        status: 'in_progress',
        assignee: 'user-456',
        order_index: 1000,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const beforeItem: Partial<WorkItem> = {
        status: 'not_started',
        assignee: 'user-456',
      };

      await dispatchItemNotifications({
        tenantId: 'tenant-123',
        tenantSlug: 'sunshade-demo',
        projectId: 'proj-123',
        item,
        beforeItem,
        actorName: 'Alice',
        recipientUser: {
          id: 'user-456',
          email: 'user456@sunshade.icu',
          notification_preferences: {
            notify_in_app: true,
            notify_email: false,
            notify_on_status_change: true,
            notify_on_assignment: true,
          },
        },
      });

      // In-app alert created
      expect(supabaseAdmin.from).toHaveBeenCalledWith('notifications');
    });

    it('escapes user input fields in HTML email templates to prevent XSS injection', () => {
      const escaped = escapeHtml('<script>alert("xss")</script>&"test"');
      expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&quot;test&quot;');

      const html = buildNotificationEmailHtml({
        title: '<script>alert(1)</script>',
        itemTitle: 'Item <img src=x onerror=alert(2)>',
        externalRefId: 'REF"><script>',
        actorName: 'Bob <b',
        actionText: 'did something',
        detailsHtml: '<p>Details</p>',
        deepLinkUrl: 'https://track.sunshade.icu/item?id=1"onclick="alert(3)',
      });

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    });

    it('suppresses in-app notifications when the event toggle is disabled', async () => {
      const mockInsert = vi.fn();
      (supabaseAdmin.from as any).mockReturnValue({
        insert: mockInsert,
      });

      const item: WorkItem = {
        id: 'item-200',
        tenant_id: 'tenant-123',
        project_id: 'proj-123',
        title: 'Feature Item',
        item_type: 'task',
        status: 'in_progress',
        assignee: 'user-456',
        order_index: 1000,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const beforeItem: Partial<WorkItem> = {
        status: 'not_started',
        assignee: 'user-456', // No assignment change, only status change
      };

      await dispatchItemNotifications({
        tenantId: 'tenant-123',
        projectId: 'proj-123',
        item,
        beforeItem,
        recipientUser: {
          id: 'user-456',
          notification_preferences: {
            notify_in_app: true,
            notify_email: false,
            notify_on_status_change: false, // Disabled!
            notify_on_assignment: true,
          },
        },
      });

      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('resolves display labels and email addresses to tenant member identities', async () => {
      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ user_id: 'user-uuid-999' }],
            error: null,
          }),
        }),
      });

      (supabaseAdmin as any).auth = {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: 'user-uuid-999',
                email: 'tym@sunshade.icu',
                user_metadata: {
                  full_name: 'Tym Pollack',
                  notification_preferences: {
                    notify_in_app: true,
                    notify_email: false,
                    notify_on_assignment: true,
                    notify_on_status_change: true,
                  },
                },
              },
            },
          }),
        },
      };

      const resByName = await resolveRecipient('tenant-123', 'Tym Pollack');
      expect(resByName).not.toBeNull();
      expect(resByName?.id).toBe('user-uuid-999');
      expect(resByName?.notification_preferences?.notify_email).toBe(false);

      const resByMe = await resolveRecipient('tenant-123', 'Me (Tym Pollack)');
      expect(resByMe?.id).toBe('user-uuid-999');

      const resByPrefix = await resolveRecipient('tenant-123', 'tym');
      expect(resByPrefix?.id).toBe('user-uuid-999');
    });
  });

  describe('UI Component: NotificationBell', () => {
    it('renders bell icon and displays unread counter badge', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          count: 2,
          unread_count: 2,
          notifications: [
            {
              id: 'n1',
              tenant_id: 'tenant-123',
              user_id: 'user-1',
              actor_name: 'Alice',
              item_id: 'item-1',
              item_title: 'Build audit system',
              action: 'assigned you to this item',
              read: false,
              created_at: new Date().toISOString(),
            },
            {
              id: 'n2',
              tenant_id: 'tenant-123',
              user_id: 'user-1',
              actor_name: 'Bob',
              item_id: 'item-2',
              item_title: 'UI polish',
              action: 'changed status to done',
              read: false,
              created_at: new Date().toISOString(),
            },
          ],
        }),
      });

      render(<NotificationBell tenantSlug="sunshade-demo" />);

      // Bell button exists
      const bellBtn = screen.getByRole('button', { name: /Notifications/i });
      expect(bellBtn).toBeDefined();

      // Badge renders count 2
      await waitFor(() => {
        expect(screen.getByText('2')).toBeDefined();
      });

      // Click bell to open dropdown inbox
      fireEvent.click(bellBtn);

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeDefined();
        expect(screen.getByText('Build audit system')).toBeDefined();
        expect(screen.getByText('UI polish')).toBeDefined();
        expect(screen.getByText('Mark all read')).toBeDefined();
      });
    });
  });

  describe('UI Component: WorkItemModal Activity Log Tab', () => {
    const sampleItem: WorkItem = {
      id: 'item-modal-1',
      tenant_id: 'tenant-123',
      project_id: 'proj-123',
      title: 'Work item with history',
      item_type: 'task',
      status: 'in_progress',
      order_index: 1000,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const sampleSettings: ProjectSettings = {
      schema_version: '1.0',
      hierarchy: [
        { type: 'task', label: 'Task', level: 0, allowed_parents: [] },
      ],
      statuses: [
        { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 0 },
        { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 1 },
        { id: 'done', label: 'Done', color: '#10b981', order: 2 },
      ],
      custom_fields: [],
    };

    it('renders Details and Activity Log tabs in WorkItemModal and displays activity timeline', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          count: 2,
          audit_logs: [
            {
              id: 'log-1',
              tenant_id: 'tenant-123',
              project_id: 'proj-123',
              item_id: sampleItem.id,
              actor_name: 'Sarah Connor',
              action: 'update',
              changed_fields: {
                status: { before: 'not_started', after: 'in_progress' },
              },
              created_at: new Date().toISOString(),
            },
            {
              id: 'log-2',
              tenant_id: 'tenant-123',
              project_id: 'proj-123',
              item_id: sampleItem.id,
              actor_name: 'John Doe',
              action: 'create',
              changed_fields: {},
              created_at: new Date().toISOString(),
            },
          ],
        }),
      });

      render(
        <WorkItemModal
          item={sampleItem}
          isOpen={true}
          onClose={() => {}}
          onSave={() => {}}
          onDelete={() => {}}
          projectSettings={sampleSettings}
          allItems={[sampleItem]}
          tenantSlug="sunshade-demo"
        />
      );

      // Tab buttons exist
      expect(screen.getByRole('button', { name: /Details/i })).toBeDefined();
      const activityTabBtn = screen.getByRole('button', { name: /Activity Log/i });
      expect(activityTabBtn).toBeDefined();

      // Switch to Activity Log tab
      fireEvent.click(activityTabBtn);

      await waitFor(() => {
        expect(screen.getByText('Change History & Audit Trail')).toBeDefined();
        expect(screen.getByText('Sarah Connor')).toBeDefined();
        expect(screen.getByText('John Doe')).toBeDefined();
      });
    });
  });
});
