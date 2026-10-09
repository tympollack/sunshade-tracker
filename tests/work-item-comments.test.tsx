import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { getItemComments, addComment, deleteComment } from '@/app/actions/commentActions';
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

  describe('Server Actions (commentActions.ts)', () => {
    const mockComments = [
      {
        id: 'c-1',
        item_id: 'item-101',
        author_id: 'user-1',
        author_name: 'Tymz',
        content: 'Initial planning comment',
        created_at: '2026-10-09T10:00:00Z',
        updated_at: '2026-10-09T10:00:00Z',
      },
      {
        id: 'c-2',
        item_id: 'item-101',
        author_id: 'user-2',
        author_name: 'Sarah',
        content: 'Reviewed specifications',
        created_at: '2026-10-09T11:00:00Z',
        updated_at: '2026-10-09T11:00:00Z',
      },
    ];

    it('getItemComments returns chronological list of comments for valid itemId', async () => {
      const mockOrder = vi.fn().mockResolvedValue({ data: mockComments, error: null });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabaseAdmin.from as any).mockReturnValue({ select: mockSelect });

      const result = await getItemComments('item-101');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].author_name).toBe('Tymz');
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true });
    });

    it('getItemComments guards invalid or missing itemId', async () => {
      const result = await getItemComments('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Item ID is required');
    });

    it('getItemComments returns error when Supabase query fails', async () => {
      const mockOrder = vi.fn().mockResolvedValue({ data: null, error: { message: 'Database connection failed' } });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabaseAdmin.from as any).mockReturnValue({ select: mockSelect });

      const result = await getItemComments('item-101');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });

    it('addComment guards empty content and validates itemId', async () => {
      const resEmpty = await addComment('item-101', '   ');
      expect(resEmpty.success).toBe(false);
      expect(resEmpty.error).toBe('Comment content cannot be empty');

      const resNoId = await addComment('', 'Valid comment');
      expect(resNoId.success).toBe(false);
      expect(resNoId.error).toBe('Item ID is required');
    });

    it('addComment inserts comment and resolves current user metadata', async () => {
      (createServerClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: 'auth-user-99',
                user_metadata: { full_name: 'Alice Developer' },
              },
            },
            error: null,
          }),
        },
      });

      const inserted = {
        id: 'new-c-1',
        item_id: 'item-101',
        author_id: 'auth-user-99',
        author_name: 'Alice Developer',
        content: 'Ready for QA verification',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: inserted, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      (supabaseAdmin.from as any).mockReturnValue({ insert: mockInsert });

      const result = await addComment('item-101', 'Ready for QA verification');
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('new-c-1');
      expect(result.data?.author_name).toBe('Alice Developer');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          item_id: 'item-101',
          author_id: 'auth-user-99',
          author_name: 'Alice Developer',
          content: 'Ready for QA verification',
        })
      );
    });

    it('addComment gracefully handles database insert error', async () => {
      (createServerClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      });

      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'Foreign key constraint violated' } });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      (supabaseAdmin.from as any).mockReturnValue({ insert: mockInsert });

      const result = await addComment('invalid-item', 'Test comment');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Foreign key constraint violated');
    });

    it('deleteComment removes comment by ID', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      (supabaseAdmin.from as any).mockReturnValue({ delete: mockDelete });

      const result = await deleteComment('comment-to-delete');
      expect(result.success).toBe(true);
      expect(mockEq).toHaveBeenCalledWith('id', 'comment-to-delete');
    });
  });

  describe('MarkdownRenderer & Relative Time Utility', () => {
    it('formatRelativeTime formats recent dates', () => {
      const now = new Date();
      expect(formatRelativeTime(now.toISOString())).toBe('just now');

      const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
      expect(formatRelativeTime(tenMinsAgo.toISOString())).toBe('10m ago');

      const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000);
      expect(formatRelativeTime(twoHoursAgo.toISOString())).toBe('2h ago');
    });

    it('renders inline markdown: bold, italic, code, links', () => {
      const { container } = render(
        <MarkdownRenderer content="Here is **bold text**, *italic text*, `inline code`, and [Documentation](https://sunshade.icu)" />
      );

      expect(screen.getByText('bold text')).toBeDefined();
      expect(screen.getByText('italic text')).toBeDefined();
      expect(screen.getByText('inline code')).toBeDefined();
      const link = screen.getByRole('link', { name: 'Documentation' });
      expect(link.getAttribute('href')).toBe('https://sunshade.icu');
    });

    it('renders code blocks, blockquotes, and lists', () => {
      const content = "```ts\nconst x = 42;\n```\n> Important architectural note\n- Item 1\n- Item 2";
      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('const x = 42;')).toBeDefined();
      expect(screen.getByText('Important architectural note')).toBeDefined();
      expect(screen.getByText('Item 1')).toBeDefined();
      expect(screen.getByText('Item 2')).toBeDefined();
    });
  });

  describe('WorkItemComments Component', () => {
    const initialComments = [
      {
        id: 'c-101',
        item_id: 'item-alpha',
        author_id: 'u-1',
        author_name: 'Devin',
        content: 'Drafting initial implementation for comments thread.',
        created_at: new Date(Date.now() - 60000).toISOString(),
        updated_at: new Date(Date.now() - 60000).toISOString(),
      },
    ];

    it('renders empty state when there are no comments', async () => {
      const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabaseAdmin.from as any).mockReturnValue({ select: mockSelect });

      render(
        <WorkItemComments
          itemId="item-empty"
          initialComments={[]}
          currentUser={{ full_name: 'Test User' }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('comments-empty-state')).toBeDefined();
      });
      expect(screen.getByText('No comments yet')).toBeDefined();
    });

    it('renders discussion feed with initial comments', () => {
      render(
        <WorkItemComments
          itemId="item-alpha"
          initialComments={initialComments}
          currentUser={{ full_name: 'Test User' }}
        />
      );

      expect(screen.getByText('Devin')).toBeDefined();
      expect(screen.getByText('Drafting initial implementation for comments thread.')).toBeDefined();
      expect(screen.getByTestId('comments-count-badge').textContent).toBe('1');
    });

    it('allows toggling between Write and Preview mode', () => {
      render(
        <WorkItemComments
          itemId="item-alpha"
          initialComments={initialComments}
          currentUser={{ full_name: 'Test User' }}
        />
      );

      const textarea = screen.getByTestId('comment-input-textarea');
      fireEvent.change(textarea, { target: { value: 'Previewing **bold markdown** note' } });

      const previewBtn = screen.getByRole('button', { name: /Preview/i });
      fireEvent.click(previewBtn);

      expect(screen.getByTestId('comment-preview-area')).toBeDefined();
      expect(screen.getByText('bold markdown')).toBeDefined();

      const writeBtn = screen.getByRole('button', { name: /Write/i });
      fireEvent.click(writeBtn);
      expect(screen.getByTestId('comment-input-textarea')).toBeDefined();
    });

    it('submits a new comment and updates the feed immediately', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'c-102',
          item_id: 'item-alpha',
          author_id: 'u-user',
          author_name: 'Test User',
          content: 'Here is a new verified comment',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      (supabaseAdmin.from as any).mockReturnValue({ insert: mockInsert });

      const onCountChange = vi.fn();

      render(
        <WorkItemComments
          itemId="item-alpha"
          initialComments={initialComments}
          currentUser={{ full_name: 'Test User' }}
          onCommentCountChange={onCountChange}
        />
      );

      const textarea = screen.getByTestId('comment-input-textarea');
      fireEvent.change(textarea, { target: { value: 'Here is a new verified comment' } });

      const submitBtn = screen.getByTestId('submit-comment-btn');
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      await waitFor(() => {
        expect(screen.getByText('Here is a new verified comment')).toBeDefined();
      });

      expect(screen.getByTestId('comments-count-badge').textContent).toBe('2');
      expect(onCountChange).toHaveBeenCalledWith(2);
    });

    it('displays error banner if comment submission fails', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Simulated network drop' },
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      (supabaseAdmin.from as any).mockReturnValue({ insert: mockInsert });

      render(
        <WorkItemComments
          itemId="item-alpha"
          initialComments={initialComments}
          currentUser={{ full_name: 'Test User' }}
        />
      );

      const textarea = screen.getByTestId('comment-input-textarea');
      fireEvent.change(textarea, { target: { value: 'Failing comment' } });

      const submitBtn = screen.getByTestId('submit-comment-btn');
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('comments-error-banner')).toBeDefined();
        expect(screen.getByText('Simulated network drop')).toBeDefined();
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
      id: 'modal-item-1',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Item with comments tab',
      item_type: 'task',
      status: 'in_progress',
      order_index: 1000,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('renders Comments tab in WorkItemModalHeader and switches to comments view', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'c-m-1',
            item_id: 'modal-item-1',
            author_id: 'user-1',
            author_name: 'Alice',
            content: 'Modal test comment in feed',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabaseAdmin.from as any).mockReturnValue({ select: mockSelect });

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

      await act(async () => {
        fireEvent.click(commentsTabBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('work-item-comments-container')).toBeDefined();
      });
    });
  });
});
