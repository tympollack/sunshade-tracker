'use server';

import { createServerClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/db';
import type { WorkItemComment } from '@/types/tracker';

export interface CommentActionResult<T = WorkItemComment> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GetCommentsResult {
  success: boolean;
  data?: WorkItemComment[];
  error?: string;
}

export interface GetCommentCountResult {
  success: boolean;
  count?: number;
  error?: string;
}

/**
 * Validates whether the caller has access to the target work item and its tenant workspace.
 */
async function verifyWorkItemAccess(
  itemId: string,
  requireWrite: boolean = false
): Promise<{
  allowed: boolean;
  item?: any;
  user?: any;
  error?: string;
}> {
  if (!itemId || typeof itemId !== 'string') {
    return { allowed: false, error: 'Item ID is required' };
  }

  // 1. Fetch active work item
  const { data: item, error: itemErr } = await supabaseAdmin
    .from('work_items')
    .select('id, tenant_id, deleted_at')
    .eq('id', itemId)
    .is('deleted_at', null)
    .maybeSingle();

  if (itemErr || !item) {
    return { allowed: false, error: 'Work item not found' };
  }

  // 2. Fetch target tenant
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, tier, metadata, owner_id')
    .eq('id', item.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  // 3. Resolve caller session
  let user: any = null;
  try {
    const supabase = await createServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (!authError && authData?.user) {
      user = authData.user;
    }
  } catch {
    // Non-cookie environment / test fallback
  }

  const isPublicWorkspace =
    tenant &&
    (tenant.slug === 'sunshade' ||
      tenant.tier === 'demo' ||
      Boolean(tenant.metadata?.is_public));

  // 4. Write Operations (addComment, deleteComment)
  if (requireWrite) {
    if (!user) {
      return { allowed: false, error: 'Unauthorized: Session required to modify comments' };
    }

    if (isPublicWorkspace) {
      return { allowed: false, error: 'The public demo workspace is read-only. Cannot modify comments.' };
    }

    // Direct tenant owner has write permissions
    if (tenant?.owner_id === user.id) {
      return { allowed: true, item, user };
    }

    // Check membership and role
    const { data: membership } = await supabaseAdmin
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', item.tenant_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return { allowed: false, error: 'Forbidden: You are not a member of this workspace' };
    }

    if (membership.role === 'viewer') {
      return { allowed: false, error: 'Forbidden: Viewer role cannot post comments' };
    }

    return { allowed: true, item, user };
  }

  // 5. Read Operations (getItemComments, getCommentCount)
  if (isPublicWorkspace) {
    return { allowed: true, item, user };
  }

  if (!user) {
    return { allowed: false, error: 'Unauthorized: Session required to view discussion' };
  }

  if (tenant?.owner_id === user.id) {
    return { allowed: true, item, user };
  }

  const { data: membership } = await supabaseAdmin
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', item.tenant_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return { allowed: false, error: 'Forbidden: You do not have access to this workspace' };
  }

  return { allowed: true, item, user };
}

/**
 * Fetch comment count only (head count query) to avoid transferring full comment payloads for badge counters.
 */
export async function getCommentCount(itemId: string): Promise<GetCommentCountResult> {
  try {
    const access = await verifyWorkItemAccess(itemId, false);
    if (!access.allowed) {
      return { success: false, error: access.error };
    }

    const { count, error } = await supabaseAdmin
      .from('work_item_comments')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', itemId);

    if (error) {
      console.error('[commentActions] Error fetching comment count:', error);
      return { success: false, error: error.message };
    }

    return { success: true, count: count ?? 0 };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch comment count' };
  }
}

/**
 * Fetch all discussion comments for a given work item in chronological order.
 */
export async function getItemComments(itemId: string): Promise<GetCommentsResult> {
  try {
    const access = await verifyWorkItemAccess(itemId, false);
    if (!access.allowed) {
      return { success: false, error: access.error };
    }

    const { data, error } = await supabaseAdmin
      .from('work_item_comments')
      .select('id, item_id, author_id, author_name, content, created_at, updated_at')
      .eq('item_id', itemId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[commentActions] Error fetching comments:', error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (data || []) as WorkItemComment[],
    };
  } catch (err: any) {
    console.error('[commentActions] Unexpected error in getItemComments:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch comments',
    };
  }
}

/**
 * Add a new discussion comment to a work item with verified session authorship.
 */
export async function addComment(
  itemId: string,
  content: string,
  _callerNameHint?: string
): Promise<CommentActionResult<WorkItemComment>> {
  try {
    const trimmedContent = (content || '').trim();
    if (!trimmedContent) {
      return { success: false, error: 'Comment content cannot be empty' };
    }

    const access = await verifyWorkItemAccess(itemId, true);
    if (!access.allowed) {
      return { success: false, error: access.error };
    }

    const user = access.user;
    // Derive author name strictly from verified user session to prevent identity forgery
    const verifiedAuthorName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      (user.email ? user.email.split('@')[0] : '') ||
      'User';

    const { data, error } = await supabaseAdmin
      .from('work_item_comments')
      .insert({
        item_id: itemId,
        author_id: user.id,
        author_name: verifiedAuthorName,
        content: trimmedContent,
      })
      .select('id, item_id, author_id, author_name, content, created_at, updated_at')
      .single();

    if (error) {
      console.error('[commentActions] Error inserting comment:', error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: data as WorkItemComment,
    };
  } catch (err: any) {
    console.error('[commentActions] Unexpected error in addComment:', err);
    return {
      success: false,
      error: err?.message || 'Failed to post comment',
    };
  }
}

/**
 * Delete a comment by its unique identifier with strict author/admin authorization.
 */
export async function deleteComment(commentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!commentId || typeof commentId !== 'string') {
      return { success: false, error: 'Comment ID is required' };
    }

    // 1. Authenticate caller
    let user: any = null;
    try {
      const supabase = await createServerClient();
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (!authErr && authData?.user) {
        user = authData.user;
      }
    } catch {}

    if (!user) {
      return { success: false, error: 'Unauthorized: Session required to delete comments' };
    }

    // 2. Fetch comment to verify item ownership
    const { data: comment, error: commentErr } = await supabaseAdmin
      .from('work_item_comments')
      .select('id, author_id, item_id')
      .eq('id', commentId)
      .maybeSingle();

    if (commentErr || !comment) {
      return { success: false, error: 'Comment not found' };
    }

    // 3. Allow deletion if caller is original author
    if (comment.author_id === user.id) {
      const { error: delErr } = await supabaseAdmin
        .from('work_item_comments')
        .delete()
        .eq('id', commentId);

      if (delErr) {
        return { success: false, error: delErr.message };
      }
      return { success: true };
    }

    // 4. Otherwise, verify whether caller is tenant owner or admin
    const access = await verifyWorkItemAccess(comment.item_id, true);
    if (!access.allowed) {
      return { success: false, error: 'Forbidden: You do not have permission to delete this comment' };
    }

    const { error } = await supabaseAdmin
      .from('work_item_comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      console.error('[commentActions] Error deleting comment:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[commentActions] Unexpected error in deleteComment:', err);
    return {
      success: false,
      error: err?.message || 'Failed to delete comment',
    };
  }
}
