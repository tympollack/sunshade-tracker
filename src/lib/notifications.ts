import { supabaseAdmin } from '@/lib/db';
import { InAppNotification, NotificationPreferences, WorkItem } from '@/types/tracker';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  notify_in_app: true,
  notify_email: true,
  notify_on_assignment: true,
  notify_on_status_change: true,
};

export interface CreateInAppNotificationParams {
  tenant_id: string;
  user_id: string;
  actor_name?: string | null;
  item_id?: string | null;
  item_title?: string | null;
  action: string;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Inserts an in-app notification into tracker.notifications.
 * Catches errors gracefully so API requests do not fail if the table is unavailable.
 */
export async function createInAppNotification(
  params: CreateInAppNotificationParams
): Promise<InAppNotification | null> {
  try {
    const payload = {
      tenant_id: params.tenant_id,
      user_id: params.user_id,
      actor_name: params.actor_name || null,
      item_id: params.item_id || null,
      item_title: params.item_title || null,
      action: params.action,
      read: false,
      created_at: new Date().toISOString(),
    };

    const table: any = supabaseAdmin.from('notifications');
    if (!table || typeof table.insert !== 'function') {
      return null;
    }

    const { data, error } = await table
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.warn('[tracker:notifications] Failed to insert notification:', error.message);
      return null;
    }

    return data as InAppNotification;
  } catch (err: any) {
    console.warn('[tracker:notifications] Exception inserting notification:', err?.message || err);
    return null;
  }
}

/**
 * Retrieves in-app notifications for a user within a tenant.
 */
export async function getInAppNotifications(
  tenantId: string,
  userId: string,
  limit: number = 30
): Promise<{ notifications: InAppNotification[]; unread_count: number }> {
  try {
    let query: any = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId);

    if (typeof query.order === 'function') {
      query = query.order('created_at', { ascending: false });
    }
    if (typeof query.limit === 'function') {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[tracker:notifications] Failed to fetch notifications:', error.message);
      return { notifications: [], unread_count: 0 };
    }

    const notifications = (data || []) as InAppNotification[];
    const unread_count = notifications.filter((n) => !n.read).length;

    return { notifications, unread_count };
  } catch (err: any) {
    console.warn('[tracker:notifications] Exception fetching notifications:', err?.message || err);
    return { notifications: [], unread_count: 0 };
  }
}

/**
 * Marks notifications as read.
 */
export async function markNotificationsAsRead(
  tenantId: string,
  userId: string,
  options: { id?: string; ids?: string[]; all?: boolean }
): Promise<boolean> {
  try {
    let query: any = supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId);

    if (options.all) {
      query = query.eq('read', false);
    } else if (options.ids && options.ids.length > 0) {
      query = query.in('id', options.ids);
    } else if (options.id) {
      query = query.eq('id', options.id);
    }

    const { error } = await query;
    if (error) {
      console.warn('[tracker:notifications] Failed to mark notifications read:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('[tracker:notifications] Exception marking notifications read:', err?.message || err);
    return false;
  }
}

/**
 * Sends a transactional email using the Resend REST API.
 * Gracefully returns skipped: true if RESEND_API_KEY is not configured.
 */
export async function sendResendEmail(
  params: SendEmailParams
): Promise<{ success: boolean; data?: any; error?: string; skipped?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Graceful no-op when key is omitted
    return { success: true, skipped: true };
  }

  const fromAddress =
    process.env.RESEND_FROM_EMAIL || 'SunShade Tracker <notifications@sunshade.icu>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.warn('[tracker:resend] Email dispatch failed:', result);
      return { success: false, error: result.message || 'Resend API error' };
    }

    return { success: true, data: result };
  } catch (err: any) {
    console.warn('[tracker:resend] Exception sending email:', err?.message || err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Builds a clean, branded HTML email template for SunShade Tracker notifications.
 */
export function buildNotificationEmailHtml(params: {
  title: string;
  itemTitle: string;
  externalRefId?: string | null;
  actorName: string;
  actionText: string;
  detailsHtml?: string;
  deepLinkUrl: string;
}): string {
  const refBadge = params.externalRefId
    ? `<span style="display:inline-block;padding:2px 8px;font-size:11px;font-family:monospace;background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:4px;margin-right:6px;">${params.externalRefId}</span>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${params.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0f17;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f1f5f9;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0f17;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#111827;border:1px solid #1f2937;border-radius:12px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding:24px 28px;background-color:#0f172a;border-bottom:1px solid #1e293b;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size:16px;font-weight:700;color:#10b981;letter-spacing:0.5px;">
                      ✦ SUNSHADE TRACKER
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding:28px 28px 20px 28px;">
              <div style="font-size:18px;font-weight:600;color:#ffffff;margin-bottom:12px;line-height:1.4;">
                ${refBadge}${params.itemTitle}
              </div>

              <div style="padding:14px 16px;background-color:#090d16;border:1px solid #1e293b;border-radius:8px;margin-bottom:20px;">
                <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">
                  <strong style="color:#f8fafc;">${params.actorName}</strong> ${params.actionText}
                </p>
                ${params.detailsHtml ? `<div style="margin-top:8px;font-size:12px;color:#cbd5e1;">${params.detailsHtml}</div>` : ''}
              </div>

              <!-- Action Button -->
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:#10b981;">
                    <a href="${params.deepLinkUrl}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:13px;font-weight:600;color:#0b0f17;text-decoration:none;border-radius:8px;background-color:#10b981;">
                      View Work Item →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 28px;background-color:#090d16;border-top:1px solid #1e293b;text-align:center;">
              <p style="margin:0;font-size:11px;color:#64748b;line-height:1.4;">
                You received this notification because your SunShade Tracker notification preferences are enabled.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export interface DispatchItemNotificationsParams {
  tenantId: string;
  tenantSlug?: string;
  projectId: string;
  projectSlug?: string;
  item: WorkItem;
  beforeItem?: Partial<WorkItem> | null;
  actorId?: string | null;
  actorName?: string | null;
  recipientUser?: { id: string; email?: string; notification_preferences?: Partial<NotificationPreferences> } | null;
}

/**
 * Evaluates work item mutation diffs (assignment changes, status transitions)
 * and dispatches in-app alerts and Resend emails respecting recipient preferences.
 */
export async function dispatchItemNotifications(
  params: DispatchItemNotificationsParams
): Promise<void> {
  const { tenantId, tenantSlug, projectSlug, item, beforeItem, actorName, recipientUser } = params;

  const actor = actorName || 'System';
  const beforeStatus = beforeItem?.status;
  const newStatus = item.status;
  const beforeAssignee = beforeItem?.assignee;
  const newAssignee = item.assignee;

  const statusChanged = beforeStatus !== undefined && beforeStatus !== null && beforeStatus !== newStatus;
  const assignmentChanged = newAssignee !== undefined && newAssignee !== null && newAssignee !== beforeAssignee;

  if (!statusChanged && !assignmentChanged) {
    return;
  }

  // Determine recipient preferences
  const prefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(recipientUser?.notification_preferences || {}),
  };

  const domain = process.env.NEXT_PUBLIC_APP_URL || 'https://track.sunshade.icu';
  const tenantPath = tenantSlug || 'sunshade';
  const projectPath = projectSlug || 'all';
  const deepLink = `${domain}/${encodeURIComponent(tenantPath)}/${encodeURIComponent(projectPath)}?item=${item.id}`;

  const recipientUserId = recipientUser?.id || (newAssignee ? String(newAssignee) : null);

  // 1. In-App Notifications
  if (prefs.notify_in_app && recipientUserId) {
    let actionDesc = '';
    if (statusChanged && assignmentChanged) {
      actionDesc = `assigned you and changed status to "${newStatus}"`;
    } else if (assignmentChanged) {
      actionDesc = `assigned you to this item`;
    } else if (statusChanged) {
      actionDesc = `updated status to "${newStatus}"`;
    }

    // Fire and forget in-app alert
    createInAppNotification({
      tenant_id: tenantId,
      user_id: recipientUserId,
      actor_name: actor,
      item_id: item.id,
      item_title: item.title,
      action: actionDesc,
    }).catch((err) => console.warn('[tracker:notifications] in-app notification error:', err));
  }

  // 2. Email Notifications via Resend
  const shouldSendEmail =
    prefs.notify_email &&
    recipientUser?.email &&
    ((assignmentChanged && prefs.notify_on_assignment) || (statusChanged && prefs.notify_on_status_change));

  if (shouldSendEmail && recipientUser?.email) {
    let actionText = '';
    let detailsHtml = '';

    if (statusChanged && assignmentChanged) {
      actionText = `assigned you to this item and changed status to <span style="color:#10b981;font-weight:600;">${newStatus}</span>`;
      detailsHtml = `<p style="margin:4px 0;">Status transition: <code>${beforeStatus || 'none'}</code> → <code>${newStatus}</code></p>`;
    } else if (assignmentChanged) {
      actionText = `assigned you to this item`;
    } else if (statusChanged) {
      actionText = `changed status to <span style="color:#10b981;font-weight:600;">${newStatus}</span>`;
      detailsHtml = `<p style="margin:4px 0;">Status transition: <code>${beforeStatus}</code> → <code>${newStatus}</code></p>`;
    }

    const subject = `[SunShade Tracker] ${item.external_ref_id ? `[${item.external_ref_id}] ` : ''}${item.title} - ${actor} updated item`;
    const html = buildNotificationEmailHtml({
      title: subject,
      itemTitle: item.title,
      externalRefId: item.external_ref_id,
      actorName: actor,
      actionText,
      detailsHtml,
      deepLinkUrl: deepLink,
    });

    // Fire and forget email dispatch
    sendResendEmail({
      to: recipientUser.email,
      subject,
      html,
      text: `${actor} ${actionText} on "${item.title}". View item: ${deepLink}`,
    }).catch((err) => console.warn('[tracker:resend] async email dispatch error:', err));
  }
}
