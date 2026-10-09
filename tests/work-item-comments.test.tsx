import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { getItemComments, addComment, deleteComment, getCommentCount } from '@/app/actions/commentActions';
import { WorkItemComments, MarkdownRenderer, formatRelativeTime } from '@/components/WorkItemComments';
import { WorkItemModal } from '@/components/WorkItemModal';
import { WorkItem, ProjectSettings } from '@/types/tracker';
import { supabaseAdmin } from '@/lib/db';
import { createServerClient } from '@/lib/supabase-server';

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

describe('Work Item Comments Feature [FEAT-TRK-ITEM-COMMENTS]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupDefaultDbMocks = (options: {
    user?: any;
    tenantOwnerId?: string;
    membershipRole?: string;
    comments?: any[];
  } = {}) => {
    const user = 'user' in options ? options.user : {
      id: 'auth-user-99',
      user_metadata: { full_name: 'Verified User' },
      email: 'verified@sunshade.icu',
    };

    (createServerClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user },
          error: null,
        }),
      },
    });

    const mockItem = {
      id: 'item-101',
      tenant_id: 'tenant-100',
      deleted_at: null,
    };

    const mockTenant = {
      id: 'tenant-100',
      slug: 'my-team',
      tier: 'pro',
      metadata: {},
      owner_id: options.tenantOwnerId ?? 'auth-user-99',
    };

    const commentsList = options.comments ?? [
      {
        id: 'c-1',
        item_id: 'item-101',
        author_id: 'auth-user-99',
        author_name: 'Verified User',
        content: 'Initial planning comment',
        created_at: '2026-10-09T10:00:00Z',
        updated_at: '2026-10-09T10:00:00Z',
      },
    ];

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'work_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockItem, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'tenants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'tenant_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: options.membershipRole ? { role: options.membershipRole } : { role: 'member' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'work_item_comments') {
        return {
          select: vi.fn().mockImplementation((fields: string, opts?: any) => {
            if (opts?.head) {
              return {
                eq: vi.fn().mockResolvedValue({ count: commentsList.length, error: null }),
              };
            }
            return {
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: commentsList, error: null }),
                maybeSingle: vi.fn().mockResolvedValue({
                  data: commentsList[0] || null,
                  error: null,
                }),
              }),
            };
          }),
          insert: vi.fn().mockImplementation((payload: any) => ({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'c-new-created',
                  item_id: payload?.item_id || 'item-101',
                  author_id: user?.id,
                  author_name: 'Verified User',
                  content: payload?.content || 'A newly added comment',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                error: null,
              }),
            }),
          })),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {};
    });
  };

  describe('Server Actions Security & Integrity (commentActions.ts)', () => {
    it('getItemComments returns chronological comments for authorized member', async () => {
      setupDefaultDbMocks();
      const result = await getItemComments('item-101');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].author_name).toBe('Verified User');
    });

    it('getItemComments rejects unauthenticated request for private workspace', async () => {
      setupDefaultDbMocks({ user: null, tenantOwnerId: 'other-user' });
      const result = await getItemComments('item-101');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unauthorized/i);
    });

    it('getCommentCount executes a lightweight head count query', async () => {
      setupDefaultDbMocks();
      const result = await getCommentCount('item-101');
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });

    it('addComment derives author strictly from verified session and prevents forgery', async () => {
      setupDefaultDbMocks();
      const result = await addComment('item-101', 'Discussion note', 'Forged Impersonator Name');
      expect(result.success).toBe(true);
      expect(result.data?.author_name).toBe('Verified User');
    });

    it('addComment forbids posting in read-only public workspace', async () => {
      (createServerClient as any).mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
      });
      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'item-public', tenant_id: 't-pub' }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 't-pub', tier: 'demo' }, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await addComment('item-public', 'Testing public post');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/read-only/i);
    });

    it('deleteComment requires session and permits only author or admin', async () => {
      setupDefaultDbMocks({ user: { id: 'auth-user-99' } });
      const result = await deleteComment('c-1');
      expect(result.success).toBe(true);
    });

    it('deleteComment rejects unauthorized deletion attempts', async () => {
      (createServerClient as any).mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      });
      const result = await deleteComment('c-1');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unauthorized/i);
    });
  });

  describe('MarkdownRenderer & Relative Time Utility', () => {
    it('formatRelativeTime formats recent dates cleanly', () => {
      const now = new Date();
      expect(formatRelativeTime(now.toISOString())).toBe('just now');

      const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
      expect(formatRelativeTime(tenMinsAgo.toISOString())).toBe('10m ago');

      const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000);
      expect(formatRelativeTime(twoHoursAgo.toISOString())).toBe('2h ago');
    });

    it('renders inline and block markdown correctly', () => {
      render(
        <MarkdownRenderer content="Here is **bold**, *italic*, `code`, and [Link](https://sunshade.icu)" />
      );

      expect(screen.getByText('bold')).toBeDefined();
      expect(screen.getByText('italic')).toBeDefined();
      expect(screen.getByText('code')).toBeDefined();
      const link = screen.getByRole('link', { name: 'Link' });
      expect(link.getAttribute('href')).toBe('https://sunshade.icu');
    });

    it('renders code blocks, blockquotes, and lists', () => {
      const content = "```ts\nconst x = 42;\n```\n> Architecture notes\n- Bullet A\n- Bullet B";
      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('const x = 42;')).toBeDefined();
      expect(screen.getByText('Architecture notes')).toBeDefined();
      expect(screen.getByText('Bullet A')).toBeDefined();
      expect(screen.getByText('Bullet B')).toBeDefined();
    });
  });

  describe('WorkItemComments UI Component & Concurrency', () => {
    it('renders empty state when there are zero comments', async () => {
      setupDefaultDbMocks({ comments: [] });

      render(
        <WorkItemComments
          itemId="item-empty"
          currentUser={{ full_name: 'Test User' }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('comments-empty-state')).toBeDefined();
      });
      expect(screen.getByText('No comments yet')).toBeDefined();
    });

    it('renders discussion feed and toggles write/preview modes', async () => {
      setupDefaultDbMocks();

      render(
        <WorkItemComments
          itemId="item-101"
          currentUser={{ full_name: 'Verified User' }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Verified User')).toBeDefined();
        expect(screen.getByText('Initial planning comment')).toBeDefined();
      });

      const textarea = screen.getByTestId('comment-input-textarea');
      fireEvent.change(textarea, { target: { value: 'Previewing **bold markdown**' } });

      const previewBtn = screen.getByRole('button', { name: /Preview/i });
      fireEvent.click(previewBtn);

      expect(screen.getByTestId('comment-preview-area')).toBeDefined();
      expect(screen.getByText('bold markdown')).toBeDefined();
    });

    it('submits a new comment and updates the feed immediately', async () => {
      setupDefaultDbMocks();
      const onCountChange = vi.fn();

      render(
        <WorkItemComments
          itemId="item-101"
          currentUser={{ full_name: 'Verified User' }}
          onCommentCountChange={onCountChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Initial planning comment')).toBeDefined();
      });

      const textarea = screen.getByTestId('comment-input-textarea');
      fireEvent.change(textarea, { target: { value: 'A newly added comment' } });

      const submitBtn = screen.getByTestId('submit-comment-btn');
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      await waitFor(() => {
        expect(screen.getByText('A newly added comment')).toBeDefined();
      });
      expect(onCountChange).toHaveBeenCalledWith(2);
    });

    it('submits comment on Ctrl+Enter keyboard shortcut and stops propagation', async () => {
      setupDefaultDbMocks({ comments: [] });
      const onCountChange = vi.fn();

      render(
        <WorkItemComments
          itemId="item-101"
          currentUser={{ full_name: 'Verified User' }}
          onCommentCountChange={onCountChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('comment-input-textarea')).toBeDefined();
      });

      const textarea = screen.getByTestId('comment-input-textarea');
      fireEvent.change(textarea, { target: { value: 'Shortcut submission' } });

      const keyDownEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      const stopPropagationSpy = vi.spyOn(keyDownEvent, 'stopPropagation');
      const preventDefaultSpy = vi.spyOn(keyDownEvent, 'preventDefault');

      await act(async () => {
        textarea.dispatchEvent(keyDownEvent);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();

      await waitFor(() => {
        expect(screen.getByText('Shortcut submission')).toBeDefined();
      });
    });
  });

  describe('WorkItemModal Integration', () => {
    const sampleSettings: ProjectSettings = {
      schema_version: '1.0',
      hierarchy: [{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }],
      statuses: [{ id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 1 }],
      custom_fields: [],
    };

    const sampleItem: WorkItem = {
      id: 'item-101',
      tenant_id: 'tenant-100',
      project_id: 'proj-1',
      title: 'Item with comments tab',
      item_type: 'task',
      status: 'in_progress',
      order_index: 1000,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('renders Comments tab in WorkItemModalHeader with count badge and switches tabs', async () => {
      setupDefaultDbMocks();

      await act(async () => {
        render(
          <WorkItemModal
            item={sampleItem}
            isOpen={true}
            onClose={() => {}}
            onSave={() => {}}
            onDelete={() => {}}
            projectSettings={sampleSettings}
            allItems={[sampleItem]}
          />
        );
      });

      const commentsTabBtn = screen.getByTestId('modal-tab-comments');
      expect(commentsTabBtn).toBeDefined();

      await waitFor(() => {
        expect(screen.getByTestId('header-comments-count').textContent).toBe('1');
      });

      await act(async () => {
        fireEvent.click(commentsTabBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('work-item-comments-container')).toBeDefined();
      });
    });
  });
});
