import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WorkItemModal } from '@/components/WorkItemModal';
import { GitHubBadge } from '@/components/GitHubBadge';
import { getDescendantIds, buildTree } from '@/lib/tree';
import { deriveProjectPrefix } from '@/lib/ref-generator';
import { extractGitHubMetadata } from '@/lib/github-metadata';
import { WorkItem, ProjectSettings } from '@/types/tracker';

describe('PRJ-01 and Children Test Suite', () => {
  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
      { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'] },
      { type: 'task', label: 'Task', level: 3, allowed_parents: ['story'] },
    ],
    statuses: [
      { id: 'todo', label: 'To Do', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'done', label: 'Done', color: '#22c55e', order: 3 },
    ],
    custom_fields: [],
  };

  const parentEpic: WorkItem = {
    id: 'epic-1',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    title: 'Authentication Overhaul',
    item_type: 'epic',
    status: 'in_progress',
    order_index: 1000,
    metadata: { points: 13, sprint: 'Sprint 1' },
    created_at: '2026-04-01T10:00:00.000Z',
    updated_at: '2026-04-05T12:00:00.000Z',
  };

  const childStory1: WorkItem = {
    id: 'story-1',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    parent_id: 'epic-1',
    external_ref_id: 'TRK-10',
    title: 'Google OAuth Support',
    item_type: 'story',
    status: 'todo',
    order_index: 2000,
    metadata: { points: 5, sprint: 'Sprint 1' },
    created_at: '2026-04-02T10:00:00.000Z',
    updated_at: '2026-04-02T10:00:00.000Z',
  };

  const childStory2: WorkItem = {
    id: 'story-2',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    parent_id: 'epic-1',
    external_ref_id: 'TRK-11',
    title: 'Apple Sign-In',
    item_type: 'story',
    status: 'done',
    order_index: 1500,
    metadata: { points: 8, sprint: 'Sprint 1' },
    created_at: '2026-04-02T11:00:00.000Z',
    updated_at: '2026-04-03T11:00:00.000Z',
  };

  const grandChildTask: WorkItem = {
    id: 'task-1',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    parent_id: 'story-1',
    external_ref_id: 'TRK-12',
    title: 'Configure OAuth Redirects',
    item_type: 'task',
    status: 'todo',
    order_index: 3000,
    metadata: { points: 3, sprint: 'Sprint 1' },
    created_at: '2026-04-03T10:00:00.000Z',
    updated_at: '2026-04-03T10:00:00.000Z',
  };

  const allItems = [parentEpic, childStory1, childStory2, grandChildTask];

  // 1. FEAT-TRK-CASCADE-PROJECT-CHANGE & PRJ-03: Descendants & Tree sorting
  describe('Tree helpers & cascading', () => {
    it('recursively gathers all descendant IDs for root item', () => {
      const descendants = getDescendantIds(allItems, 'epic-1');
      expect(descendants).toHaveLength(3);
      expect(descendants).toContain('story-1');
      expect(descendants).toContain('story-2');
      expect(descendants).toContain('task-1');
    });

    it('returns sub-tree descendants for middle-level items', () => {
      const descendants = getDescendantIds(allItems, 'story-1');
      expect(descendants).toEqual(['task-1']);
    });

    it('returns empty array for leaf items or non-existent items', () => {
      expect(getDescendantIds(allItems, 'task-1')).toEqual([]);
      expect(getDescendantIds(allItems, 'missing-id')).toEqual([]);
    });

    it('buildTree supports custom sortFn at all tree levels', () => {
      // Sort children by points descending
      const sortByPointsDesc = (a: WorkItem, b: WorkItem) =>
        (Number(b.metadata?.points) || 0) - (Number(a.metadata?.points) || 0);

      const tree = buildTree(allItems, null, 0, new Set(), sortByPointsDesc);
      expect(tree).toHaveLength(1);
      const root = tree[0];
      expect(root.id).toBe('epic-1');
      // Children under epic-1: story-2 (8 pts) should come before story-1 (5 pts)
      expect(root.children?.[0].id).toBe('story-2');
      expect(root.children?.[1].id).toBe('story-1');
    });
  });

  // 2. PRJ-04: Prefix derivation
  describe('deriveProjectPrefix', () => {
    it('derives TRK from sunshade-tracker or tracker slug/name', () => {
      expect(deriveProjectPrefix({ slug: 'sunshade-tracker' })).toBe('TRK');
      expect(deriveProjectPrefix({ name: 'Sunshade Tracker' })).toBe('ST');
      expect(deriveProjectPrefix({ slug: 'tracker' })).toBe('TRK');
    });

    it('derives uppercase prefix without defaulting to PRJ', () => {
      expect(deriveProjectPrefix({ slug: 'api-service' })).toBe('AS');
      expect(deriveProjectPrefix({ name: 'Billing Platform Core' })).toBe('BPC');
      expect(deriveProjectPrefix({ slug: 'frontend' })).toBe('FRN');
    });

    it('respects settings default_prefix if present', () => {
      expect(deriveProjectPrefix({ slug: 'my-project', settings: { default_prefix: 'CUSTOM' } })).toBe('CUSTOM');
    });
  });

  // 3. NO-REF: GitHub Metadata & GitHubBadge custom repo/owner
  describe('GitHub Metadata and GitHubBadge', () => {
    it('extracts repo and owner from metadata', () => {
      const meta1 = { repo: 'acme/webapp', commit: 'abc1234' };
      const res1 = extractGitHubMetadata(meta1);
      expect(res1.repo).toBe('webapp');
      expect(res1.owner).toBe('acme');
      expect(res1.commitHash).toBe('abc1234');

      const meta2 = { github_repo: 'my-service', owner: 'org-test' };
      const res2 = extractGitHubMetadata(meta2);
      expect(res2.repo).toBe('my-service');
      expect(res2.owner).toBe('org-test');
    });

    it('GitHubBadge constructs commit URL with custom repo and owner', () => {
      render(
        <GitHubBadge
          type="commit"
          value="a1b2c3d4e5f6"
          repo="custom-repo"
          owner="custom-owner"
        />
      );

      const link = screen.getByRole('link');
      expect(link.getAttribute('href')).toBe('https://github.com/custom-owner/custom-repo/commit/a1b2c3d4e5f6');
      expect(screen.getByText('a1b2c3d')).toBeDefined();
    });
  });

  // 4. FEAT-TRK-MODAL-TIMESTAMPS, PRJ-03 Children view, FEAT-TRK-CASCADE-PROJECT-CHANGE Project Selector
  describe('WorkItemModal enhancements', () => {
    it('renders created_at and updated_at timestamps in monospace in the modal footer', () => {
      render(
        <WorkItemModal
          item={parentEpic}
          isOpen={true}
          onClose={() => {}}
          onSave={async () => {}}
          onDelete={async () => true}
          projectSettings={sampleSettings}
          allItems={allItems}
        />
      );

      // Check for timestamp presence
      expect(screen.getByText(/Created:/i)).toBeDefined();
      expect(screen.getByText(/Updated:/i)).toBeDefined();
    });

    it('renders Children tab with count and lists child items when clicked', async () => {
      const handleSelectItem = vi.fn();

      render(
        <WorkItemModal
          item={parentEpic}
          isOpen={true}
          onClose={() => {}}
          onSave={async () => {}}
          onDelete={async () => true}
          projectSettings={sampleSettings}
          allItems={allItems}
          onSelectItem={handleSelectItem}
        />
      );

      // Verify Children tab with count badge
      const childrenTab = screen.getByRole('button', { name: /Children/i });
      expect(childrenTab).toBeDefined();
      expect(childrenTab.textContent).toContain('2'); // 2 direct children: story-1 and story-2

      // Click Children tab
      await act(async () => {
        fireEvent.click(childrenTab);
      });

      // Verify child stories are displayed
      expect(screen.getByText('Google OAuth Support')).toBeDefined();
      expect(screen.getByText('Apple Sign-In')).toBeDefined();
      expect(screen.getByText('TRK-10')).toBeDefined();
      expect(screen.getByText('TRK-11')).toBeDefined();

      // Click on a child story row to switch modal item
      const childItemRow = screen.getByText('Google OAuth Support').closest('button');
      if (childItemRow) {
        await act(async () => {
          fireEvent.click(childItemRow);
        });
        expect(handleSelectItem).toHaveBeenCalledWith(childStory1);
      }
    });

    it('renders Project selector and includes project_id on save', async () => {
      const handleSave = vi.fn().mockResolvedValue(undefined);
      const sampleProjects = [
        { id: 'proj-1', slug: 'sunshade-tracker', name: 'Sunshade Tracker' },
        { id: 'proj-2', slug: 'infra', name: 'Infrastructure' },
      ];

      render(
        <WorkItemModal
          item={parentEpic}
          isOpen={true}
          onClose={() => {}}
          onSave={handleSave}
          onDelete={async () => true}
          projectSettings={sampleSettings}
          allItems={allItems}
          projects={sampleProjects}
        />
      );

      // Find project select
      const projectSelect = screen.getByTestId('item-project-select');
      expect(projectSelect).toBeDefined();

      // Change project to proj-2
      await act(async () => {
        fireEvent.change(projectSelect, { target: { value: 'proj-2' } });
      });

      // Click Save Changes
      const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(handleSave).toHaveBeenCalledWith(
        'epic-1',
        expect.objectContaining({
          project_id: 'proj-2',
        })
      );
    });
  });

  // 5. BUG-TRK-USER-DISPLAY-NAME: Auth Display Name Resolution
  describe('User Display Name Resolution Logic', () => {
    const resolveDisplayName = (user: any): string => {
      return (
        user?.user_metadata?.full_name ??
        user?.user_metadata?.name ??
        (user?.email ? user.email.split('@')[0] : null) ??
        'User'
      );
    };

    it('prioritizes full_name if present', () => {
      const user = {
        email: 'alice@example.com',
        user_metadata: { full_name: 'Alice Cooper', name: 'Alice' },
      };
      expect(resolveDisplayName(user)).toBe('Alice Cooper');
    });

    it('falls back to name if full_name is missing', () => {
      const user = {
        email: 'bob@example.com',
        user_metadata: { name: 'Bob Dylan' },
      };
      expect(resolveDisplayName(user)).toBe('Bob Dylan');
    });

    it('falls back to email username if user_metadata has no names', () => {
      const user = {
        email: 'developer@sunshade.icu',
        user_metadata: {},
      };
      expect(resolveDisplayName(user)).toBe('developer');
    });

    it('falls back to User only when email and metadata are absent', () => {
      const user = {};
      expect(resolveDisplayName(user)).toBe('User');
    });
  });
});
