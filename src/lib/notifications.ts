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
    let unread_count = notifications.filter((n) => !n.read).length;

    // Run exact count query across all pages for unread count
    try {
      const countQuery: any = supabaseAdmin
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .eq('read', false);

      const { count, error: countErr } = await countQuery;
      if (!countErr && typeof count === 'number') {
        unread_count = count;
      }
    } catch {
      // Fall back to current page unread count if count query is not supported
    }

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
  const isAll = options.all === true;
  const hasIds = Array.isArray(options.ids) && options.ids.length > 0;
  const hasId = typeof options.id === 'string' && options.id.trim().length > 0;

  // Prevent empty or invalid criteria requests from accidentally marking all alerts read
  if (!isAll && !hasIds && !hasId) {
    return false;
  }

  try {
    let query: any = supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId);

    if (isAll) {
      query = query.eq('read', false);
    } else if (hasIds) {
      query = query.in('id', options.ids!);
    } else if (hasId) {
      query = query.eq('id', options.id!.trim());
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
 * HTML escape helper to prevent markup and script injection in email templates.
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
    ? `<span style="display:inline-block;padding:2px 8px;font-size:11px;font-family:monospace;background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:4px;margin-right:6px;">${escapeHtml(params.externalRefId)}</span>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(params.title)}</title>
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
                ${refBadge}${escapeHtml(params.itemTitle)}
              </div>

              <div style="padding:14px 16px;background-color:#090d16;border:1px solid #1e293b;border-radius:8px;margin-bottom:20px;">
                <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">
                  <strong style="color:#f8fafc;">${escapeHtml(params.actorName)}</strong> ${params.actionText}
                </p>
                ${params.detailsHtml ? `<div style="margin-top:8px;font-size:12px;color:#cbd5e1;">${params.detailsHtml}</div>` : ''}
              </div>

              <!-- Action Button -->
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:#10b981;">
                    <a href="${escapeHtml(params.deepLinkUrl)}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:13px;font-weight:600;color:#0b0f17;text-decoration:none;border-radius:8px;background-color:#10b981;">
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

export interface ResolvedRecipient {
  id: string; // Auth user UUID
  email?: string;
  notification_preferences?: NotificationPreferences;
}

export interface TenantRecipientResolver {
  resolve: (assignee: string | null | undefined) => ResolvedRecipient | null;
}

/**
 * Loads members and their notification preferences for a tenant once and returns
 * an in-memory resolver. Useful for bulk mutations to avoid per-item database trips.
 */
export async function getTenantMemberRecipients(
  tenantId: string
): Promise<TenantRecipientResolver> {
  const candidates: Array<{
    id: string;
    email?: string;
    fullName?: string;
    name?: string;
    notification_preferences: NotificationPreferences;
  }> = [];

  try {
    const membersTable: any = supabaseAdmin.from('tenant_members');
    if (membersTable && typeof membersTable.select === 'function') {
      const { data: members } = await membersTable
        .select('user_id')
        .eq('tenant_id', tenantId);

      if (Array.isArray(members) && members.length > 0) {
        for (const m of members) {
          if (!m?.user_id) continue;
          try {
            if (typeof (supabaseAdmin as any).auth?.admin?.getUserById === 'function') {
              const { data } = await (supabaseAdmin as any).auth.admin.getUserById(m.user_id);
              if (data?.user) {
                const u = data.user;
                const userMeta = u.user_metadata || {};
                candidates.push({
                  id: u.id,
                  email: u.email || undefined,
                  fullName: userMeta.full_name || undefined,
                  name: userMeta.name || undefined,
                  notification_preferences: {
                    ...DEFAULT_NOTIFICATION_PREFERENCES,
                    ...(userMeta.notification_preferences || {}),
                  },
                });
              }
            } else {
              candidates.push({
                id: m.user_id,
                notification_preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
              });
            }
          } catch {
            candidates.push({
              id: m.user_id,
              notification_preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
            });
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[tracker:notifications] Failed to fetch tenant members for recipient resolution:', err?.message || err);
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return {
    resolve: (assignee: string | null | undefined): ResolvedRecipient | null => {
      if (!assignee || typeof assignee !== 'string') return null;
      const clean = assignee.trim();
      if (!clean) return null;

      // Extract name/handle if wrapped in "Me (...)"
      let innerMe: string | null = null;
      if (clean.startsWith('Me (') && clean.endsWith(')')) {
        innerMe = clean.slice(4, -1).trim();
      }

      // 1. Direct UUID match in member candidates
      const byId = candidates.find((c) => c.id === clean);
      if (byId) {
        return {
          id: byId.id,
          email: byId.email,
          notification_preferences: byId.notification_preferences,
        };
      }

      // 2. Exact email match (case-insensitive)
      const cleanLower = clean.toLowerCase();
      const byEmail = candidates.find(
        (c) => c.email && c.email.toLowerCase() === cleanLower
      );
      if (byEmail) {
        return {
          id: byEmail.id,
          email: byEmail.email,
          notification_preferences: byEmail.notification_preferences,
        };
      }

      // 3. Exact full_name or name match
      const matchingByName = candidates.filter(
        (c) =>
          (c.fullName && c.fullName.toLowerCase() === cleanLower) ||
          (c.name && c.name.toLowerCase() === cleanLower)
      );
      if (matchingByName.length === 1) {
        const c = matchingByName[0];
        return {
          id: c.id,
          email: c.email,
          notification_preferences: c.notification_preferences,
        };
      } else if (matchingByName.length > 1) {
        console.warn(`[tracker:notifications] Ambiguous member match for name "${clean}"`);
        const c = matchingByName[0];
        return {
          id: c.id,
          email: c.email,
          notification_preferences: c.notification_preferences,
        };
      }

      // 4. "Me (...)" inner name/handle match
      if (innerMe) {
        const innerLower = innerMe.toLowerCase();
        const byInner = candidates.find(
          (c) =>
            (c.fullName && c.fullName.toLowerCase() === innerLower) ||
            (c.name && c.name.toLowerCase() === innerLower) ||
            (c.email && c.email.toLowerCase() === innerLower) ||
            (c.email && c.email.split('@')[0].toLowerCase() === innerLower)
        );
        if (byInner) {
          return {
            id: byInner.id,
            email: byInner.email,
            notification_preferences: byInner.notification_preferences,
          };
        }
      }

      // 5. Email prefix match (e.g. "tym" for "tym@example.com")
      const matchingByPrefix = candidates.filter(
        (c) => c.email && c.email.split('@')[0].toLowerCase() === cleanLower
      );
      if (matchingByPrefix.length === 1) {
        const c = matchingByPrefix[0];
        return {
          id: c.id,
          email: c.email,
          notification_preferences: c.notification_preferences,
        };
      } else if (matchingByPrefix.length > 1) {
        console.warn(`[tracker:notifications] Ambiguous member match for prefix "${clean}"`);
        const c = matchingByPrefix[0];
        return {
          id: c.id,
          email: c.email,
          notification_preferences: c.notification_preferences,
        };
      }

      // 6. Fallback if assignee is already a valid UUID
      if (UUID_REGEX.test(clean)) {
        return {
          id: clean,
          notification_preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
        };
      }

      // Unresolvable display label with no matching tenant member
      return null;
    },
  };
}

/**
 * Resolves an assignee string to an authenticated tenant user record.
 */
export async function resolveRecipient(
  tenantId: string,
  assignee: string | null | undefined
): Promise<ResolvedRecipient | null> {
  const resolver = await getTenantMemberRecipients(tenantId);
  return resolver.resolve(assignee);
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

  const recipientUserId = recipientUser?.id || null;

  const promises: Promise<any>[] = [];

  // 1. In-App Notifications (gated by notify_in_app AND specific event toggles)
  const sendInAppAssignment = assignmentChanged && prefs.notify_on_assignment;
  const sendInAppStatus = statusChanged && prefs.notify_on_status_change;
  const shouldNotifyInApp =
    prefs.notify_in_app &&
    recipientUserId &&
    (sendInAppAssignment || sendInAppStatus);

  if (shouldNotifyInApp && recipientUserId) {
    let actionDesc = '';
    if (sendInAppAssignment && sendInAppStatus) {
      actionDesc = `assigned you and changed status to "${newStatus}"`;
    } else if (sendInAppAssignment) {
      actionDesc = `assigned you to this item`;
    } else if (sendInAppStatus) {
      actionDesc = `updated status to "${newStatus}"`;
    }

    // Awaitable in-app alert
    promises.push(
      createInAppNotification({
        tenant_id: tenantId,
        user_id: recipientUserId,
        actor_name: actor,
        item_id: item.id,
        item_title: item.title,
        action: actionDesc,
      }).catch((err) => console.warn('[tracker:notifications] in-app notification error:', err))
    );
  }

  // 2. Email Notifications via Resend (gated by notify_email AND specific event toggles)
  const sendEmailAssignment = assignmentChanged && prefs.notify_on_assignment;
  const sendEmailStatus = statusChanged && prefs.notify_on_status_change;
  const shouldSendEmail =
    prefs.notify_email &&
    recipientUser?.email &&
    (sendEmailAssignment || sendEmailStatus);

  if (shouldSendEmail && recipientUser?.email) {
    let actionText = '';
    let detailsHtml = '';

    const safeNewStatus = escapeHtml(newStatus || '');
    const safeBeforeStatus = escapeHtml(beforeStatus || 'none');

    if (sendEmailAssignment && sendEmailStatus) {
      actionText = `assigned you to this item and changed status to <span style="color:#10b981;font-weight:600;">${safeNewStatus}</span>`;
      detailsHtml = `<p style="margin:4px 0;">Status transition: <code>${safeBeforeStatus}</code> → <code>${safeNewStatus}</code></p>`;
    } else if (sendEmailAssignment) {
      actionText = `assigned you to this item`;
    } else if (sendEmailStatus) {
      actionText = `changed status to <span style="color:#10b981;font-weight:600;">${safeNewStatus}</span>`;
      detailsHtml = `<p style="margin:4px 0;">Status transition: <code>${safeBeforeStatus}</code> → <code>${safeNewStatus}</code></p>`;
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

    // Awaitable email dispatch
    promises.push(
      sendResendEmail({
        to: recipientUser.email,
        subject,
        html,
        text: `${actor} ${actionText.replace(/<[^>]+>/g, '')} on "${item.title}". View item: ${deepLink}`,
      }).catch((err) => console.warn('[tracker:resend] async email dispatch error:', err))
    );
  }

  if (promises.length > 0) {
    await Promise.allSettled(promises);
  }
}
