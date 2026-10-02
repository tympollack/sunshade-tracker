'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { WorkItem, SprintDefinition } from '@/types/tracker';
import { buildTree, WorkItemNode } from '@/lib/tree';
import { sortSprintNames } from '@/lib/sprint-utils';

export type PivotMode = 'sprint' | 'project';

export interface PivotTreeNode {
  id: string;
  title: string;
  type: 'sprint' | 'project' | 'item';
  itemType?: string;
  item?: WorkItem;
  projectId?: string;
  projectSlug?: string;
  sprintName?: string;
  children: PivotTreeNode[];
  childCount: number;
  rollupPoints: number;
  status?: string;
  badge?: string;
  depth: number;
}

export interface TreeFilterScope {
  sprintName?: string | null;
  projectId?: string | null;
  projectSlug?: string | null;
  itemId?: string | null;
}

interface UsePivotTreeOptions {
  items: WorkItem[];
  projects: Array<{ id: string; slug: string; name: string }>;
  sprints?: SprintDefinition[];
  tenantSlug: string;
  scopedProjectSlug?: string;
  onScopeFilter?: (scope: TreeFilterScope) => void;
}

function convertItemNodeToPivotNode(
  node: WorkItemNode,
  depth: number,
  projectId?: string,
  projectSlug?: string,
  sprintName?: string
): PivotTreeNode {
  const children = (node.children || []).map((c) =>
    convertItemNodeToPivotNode(c, depth + 1, projectId, projectSlug, sprintName)
  );
  const ownPoints = Number(node.metadata?.story_points ?? node.metadata?.points ?? node.metadata?.estimate ?? 0) || 0;
  const rollupPoints = node.rollupPoints ?? (children.length > 0 ? children.reduce((s, c) => s + c.rollupPoints, 0) : ownPoints);
  const childCount = node.descendantCount ?? children.reduce((acc, c) => acc + 1 + c.childCount, 0);

  return {
    id: `item:${node.id}`,
    title: node.title,
    type: 'item' as const,
    itemType: node.item_type,
    item: node,
    projectId,
    projectSlug,
    sprintName,
    children,
    childCount,
    rollupPoints,
    status: node.status,
    depth,
  };
}

export function usePivotTree({
  items,
  projects,
  sprints = [],
  tenantSlug,
  scopedProjectSlug,
  onScopeFilter,
}: UsePivotTreeOptions) {
  const [pivotMode, setPivotMode] = useState<PivotMode>('sprint');
  const [activeScope, setActiveScope] = useState<TreeFilterScope>({});

  // LocalStorage key for persisting collapsed/expanded node IDs
  const storageKey = `sunshade_tree_state_${tenantSlug}`;

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setExpandedNodes(new Set(JSON.parse(stored)));
      }
    } catch {}
  }, [storageKey]);

  const toggleNode = useCallback(
    (nodeId: string) => {
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        } catch {}
        return next;
      });
    },
    [storageKey]
  );

  const expandAll = useCallback(
    (allNodeIds: string[]) => {
      const next = new Set(allNodeIds);
      setExpandedNodes(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {}
    },
    [storageKey]
  );

  const collapseAll = useCallback(() => {
    const next = new Set<string>();
    setExpandedNodes(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([]));
    } catch {}
  }, [storageKey]);

  const treeNodes = useMemo<PivotTreeNode[]>(() => {
    // Collect distinct sprint names
    const sprintNamesFromItems = items
      .map((i) => i.metadata?.sprint)
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
    const sprintNamesFromDefinitions = sprints.map((s) => s.name);
    const allDistinctSprints = sortSprintNames(
      Array.from(new Set([...sprintNamesFromDefinitions, ...sprintNamesFromItems]))
    );

    // Unassigned items (no sprint)
    const hasUnassignedItems = items.some((i) => !i.metadata?.sprint || String(i.metadata.sprint).trim() === '');
    const sprintBuckets = [...allDistinctSprints];
    if (hasUnassignedItems || sprintBuckets.length === 0) {
      sprintBuckets.push('No Sprint');
    }

    const projectLookup = new Map<string, { id: string; slug: string; name: string }>();
    projects.forEach((p) => {
      projectLookup.set(p.id, p);
      projectLookup.set(p.slug, p);
    });

    const isSpecificProjectScoped = Boolean(
      scopedProjectSlug &&
      scopedProjectSlug !== 'all' &&
      scopedProjectSlug !== 'portfolio'
    );
    const scopedProj = isSpecificProjectScoped
      ? projects.find((p) => p.slug === scopedProjectSlug || p.id === scopedProjectSlug)
      : undefined;

    if (pivotMode === 'sprint') {
      // Cadence Mode: Sprint > (Project) > Item
      return sprintBuckets
        .map((sprintName): PivotTreeNode | null => {
          const sprintId = `sprint:${sprintName}`;
          const isUnassigned = sprintName === 'No Sprint';

          // Items in this sprint
          const sprintItems = items.filter((item) => {
            const itemSprint = item.metadata?.sprint;
            if (isUnassigned) {
              return !itemSprint || String(itemSprint).trim() === '';
            }
            return itemSprint === sprintName;
          });

          // Resolve sprint badge / status
          const sprintDef = sprints.find((s) => s.name === sprintName);
          let badge: string | undefined;
          if (sprintDef?.is_active || sprintDef?.status === 'active') {
            badge = 'Active';
          } else if (sprintDef?.status === 'completed') {
            badge = 'Completed';
          } else if (sprintDef?.status === 'planned') {
            badge = 'Planned';
          }

          if (isSpecificProjectScoped && scopedProj) {
            // When already scoped to a specific project, omit redundant project folder in Cadence mode
            const pItems = sprintItems.filter((item) => item.project_id === scopedProj.id);
            if (pItems.length === 0 && isUnassigned) {
              return null;
            }

            const builtItemTree = buildTree(pItems);
            const childItemNodes = builtItemTree.map((node) =>
              convertItemNodeToPivotNode(node, 1, scopedProj.id, scopedProj.slug, sprintName)
            );

            const totalPoints = childItemNodes.reduce((acc, c) => acc + c.rollupPoints, 0);

            return {
              id: sprintId,
              title: sprintName,
              type: 'sprint' as const,
              sprintName,
              projectId: scopedProj.id,
              projectSlug: scopedProj.slug,
              children: childItemNodes,
              childCount: pItems.length,
              rollupPoints: totalPoints,
              badge,
              depth: 0,
            };
          }

          // Unscoped: group items by project
          const projectGroups = new Map<string, WorkItem[]>();
          sprintItems.forEach((item) => {
            const pId = item.project_id;
            if (!projectGroups.has(pId)) {
              projectGroups.set(pId, []);
            }
            projectGroups.get(pId)!.push(item);
          });

          // Build project child branches
          const projectNodes: PivotTreeNode[] = projects
            .filter((p) => projectGroups.has(p.id) || !isUnassigned)
            .map((proj) => {
              const pItems = projectGroups.get(proj.id) || [];
              const builtItemTree = buildTree(pItems);
              const childItemNodes = builtItemTree.map((node) =>
                convertItemNodeToPivotNode(node, 2, proj.id, proj.slug, sprintName)
              );

              const projTotalPoints = childItemNodes.reduce((acc, c) => acc + c.rollupPoints, 0);
              const projChildCount = pItems.length;

              return {
                id: `${sprintId}:project:${proj.id}`,
                title: proj.name,
                type: 'project' as const,
                projectId: proj.id,
                projectSlug: proj.slug,
                sprintName,
                children: childItemNodes,
                childCount: projChildCount,
                rollupPoints: projTotalPoints,
                depth: 1,
              };
            })
            .filter((pn) => pn.childCount > 0 || !isUnassigned);

          const totalSprintPoints = projectNodes.reduce((acc, p) => acc + p.rollupPoints, 0);
          const totalSprintItems = sprintItems.length;

          return {
            id: sprintId,
            title: sprintName,
            type: 'sprint' as const,
            sprintName,
            children: projectNodes,
            childCount: totalSprintItems,
            rollupPoints: totalSprintPoints,
            badge,
            depth: 0,
          };
        })
        .filter((sn): sn is PivotTreeNode => sn !== null);
    } else {
      // Domain Mode: Project > Sprint > Item
      function sGroupsHas(m: Map<string, WorkItem[]>, k: string) {
        return m.has(k);
      }

      if (isSpecificProjectScoped && scopedProj) {
        // When a specific project is selected, do not repeat the redundant root project folder inside the tree
        const projItems = items.filter((item) => item.project_id === scopedProj.id);

        const sprintGroups = new Map<string, WorkItem[]>();
        projItems.forEach((item) => {
          const sName = item.metadata?.sprint || 'No Sprint';
          if (!sGroupsHas(sprintGroups, sName)) {
            sprintGroups.set(sName, []);
          }
          sprintGroups.get(sName)!.push(item);
        });

        const sprintNodes: PivotTreeNode[] = sprintBuckets
          .filter((sName) => sprintGroups.has(sName))
          .map((sName) => {
            const sItems = sprintGroups.get(sName) || [];
            const builtItemTree = buildTree(sItems);
            const childItemNodes = builtItemTree.map((node) =>
              convertItemNodeToPivotNode(node, 1, scopedProj.id, scopedProj.slug, sName)
            );

            const sTotalPoints = childItemNodes.reduce((acc, c) => acc + c.rollupPoints, 0);
            const sChildCount = sItems.length;

            const sprintDef = sprints.find((s) => s.name === sName);
            let badge: string | undefined;
            if (sprintDef?.is_active || sprintDef?.status === 'active') {
              badge = 'Active';
            } else if (sprintDef?.status === 'completed') {
              badge = 'Completed';
            } else if (sprintDef?.status === 'planned') {
              badge = 'Planned';
            }

            return {
              id: `${scopedProj.id}:sprint:${sName}`,
              title: sName,
              type: 'sprint' as const,
              projectId: scopedProj.id,
              projectSlug: scopedProj.slug,
              sprintName: sName,
              children: childItemNodes,
              childCount: sChildCount,
              rollupPoints: sTotalPoints,
              badge,
              depth: 0,
            };
          });

        return sprintNodes;
      }

      return projects.map((proj): PivotTreeNode => {
        const projId = `project:${proj.id}`;
        const projItems = items.filter((item) => item.project_id === proj.id);

        // Group project items by sprint
        const sprintGroups = new Map<string, WorkItem[]>();
        projItems.forEach((item) => {
          const sName = item.metadata?.sprint || 'No Sprint';
          if (!sGroupsHas(sprintGroups, sName)) {
            sprintGroups.set(sName, []);
          }
          sprintGroups.get(sName)!.push(item);
        });

        // Build sprint child branches under this project
        const sprintNodes: PivotTreeNode[] = sprintBuckets
          .filter((sName) => sprintGroups.has(sName))
          .map((sName) => {
            const sItems = sprintGroups.get(sName) || [];
            const builtItemTree = buildTree(sItems);
            const childItemNodes = builtItemTree.map((node) =>
              convertItemNodeToPivotNode(node, 2, proj.id, proj.slug, sName)
            );

            const sTotalPoints = childItemNodes.reduce((acc, c) => acc + c.rollupPoints, 0);
            const sChildCount = sItems.length;

            const sprintDef = sprints.find((s) => s.name === sName);
            let badge: string | undefined;
            if (sprintDef?.is_active || sprintDef?.status === 'active') {
              badge = 'Active';
            } else if (sprintDef?.status === 'completed') {
              badge = 'Completed';
            } else if (sprintDef?.status === 'planned') {
              badge = 'Planned';
            }

            return {
              id: `${projId}:sprint:${sName}`,
              title: sName,
              type: 'sprint' as const,
              projectId: proj.id,
              projectSlug: proj.slug,
              sprintName: sName,
              children: childItemNodes,
              childCount: sChildCount,
              rollupPoints: sTotalPoints,
              badge,
              depth: 1,
            };
          });

        const totalProjPoints = sprintNodes.reduce((acc, s) => acc + s.rollupPoints, 0);
        const totalProjItems = projItems.length;

        return {
          id: projId,
          title: proj.name,
          type: 'project' as const,
          projectId: proj.id,
          projectSlug: proj.slug,
          children: sprintNodes,
          childCount: totalProjItems,
          rollupPoints: totalProjPoints,
          depth: 0,
        };
      });
    }
  }, [items, projects, sprints, pivotMode, scopedProjectSlug]);

  const selectScope = useCallback(
    (scope: TreeFilterScope) => {
      setActiveScope(scope);
      if (onScopeFilter) {
        onScopeFilter(scope);
      }
    },
    [onScopeFilter]
  );

  const clearScope = useCallback(() => {
    const empty: TreeFilterScope = {};
    setActiveScope(empty);
    if (onScopeFilter) {
      onScopeFilter(empty);
    }
  }, [onScopeFilter]);

  return {
    pivotMode,
    setPivotMode,
    treeNodes,
    activeScope,
    selectScope,
    clearScope,
    expandedNodes,
    toggleNode,
    expandAll,
    collapseAll,
  };
}
