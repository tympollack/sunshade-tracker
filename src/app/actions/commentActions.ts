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

/**
 * Fetch all discussion comments for a given work item in chronological order.
 */
export async function getItemComments(itemId: string): Promise<GetCommentsResult> {
  try {
    if (!itemId || typeof itemId !== 'string') {
      return { success: false, error: 'Item ID is required' };
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
 * Add a new discussion comment to a work item.
 */
export async function addComment(
  itemId: string,
  content: string,
  authorName?: string
): Promise<CommentActionResult<WorkItemComment>> {
  try {
    if (!itemId || typeof itemId !== 'string') {
      return { success: false, error: 'Item ID is required' };
    }

    const trimmedContent = (content || '').trim();
    if (!trimmedContent) {
      return { success: false, error: 'Comment content cannot be empty' };
    }

    let authorId: string | null = null;
    let effectiveAuthorName = (authorName || '').trim();

    try {
      const supabase = await createServerClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!userError && user) {
        authorId = user.id;
        if (!effectiveAuthorName) {
          effectiveAuthorName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            (user.email ? user.email.split('@')[0] : '') ||
            'User';
        }
      }
    } catch {
      // In test or non-cookie contexts, proceed with provided or fallback author
    }

    if (!effectiveAuthorName) {
      effectiveAuthorName = 'Anonymous';
    }

    const { data, error } = await supabaseAdmin
      .from('work_item_comments')
      .insert({
        item_id: itemId,
        author_id: authorId,
        author_name: effectiveAuthorName,
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
 * Delete a comment by its unique identifier.
 */
export async function deleteComment(commentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!commentId || typeof commentId !== 'string') {
      return { success: false, error: 'Comment ID is required' };
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
