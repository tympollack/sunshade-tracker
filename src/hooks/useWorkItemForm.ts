'use client';

import { useState, useEffect, useMemo } from 'react';
import { WorkItem, ProjectSettings, HierarchyLevel } from '@/types/tracker';
import { isItemImmutableDueToCompletedSprint } from '@/lib/sprint-utils';
import { getHierarchyLevelColor } from '@/lib/hierarchy-colors';

export interface UseWorkItemFormProps {
  item: WorkItem | null;
  isOpen: boolean;
  projectSettings: ProjectSettings;
  allItems: WorkItem[];
  currentUser?: { full_name?: string; email?: string };
  workspaceMembers?: { full_name: string; email?: string }[];
  tenantSlug?: string;
  isReadOnly?: boolean;
  projects?: Array<{ id: string; slug: string; name: string; settings?: ProjectSettings }>;
  onSave: (id: string, updates: Partial<WorkItem>) => Promise<void> | void;
  onClose: () => void;
}

export function useWorkItemForm({
  item,
  isOpen,
  projectSettings,
  allItems,
  currentUser,
  workspaceMembers = [],
  tenantSlug,
  isReadOnly = false,
  projects = [],
  onSave,
  onClose,
}: UseWorkItemFormProps) {
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [status, setStatus] = useState(item?.status || projectSettings.statuses[0]?.id || 'backlog');
  const [itemType, setItemType] = useState(item?.item_type || projectSettings.hierarchy[0]?.type || 'task');
  const [parentId, setParentId] = useState(item?.parent_id || '');
  const [assignee, setAssignee] = useState(item?.assignee || '');
  const [externalRef, setExternalRef] = useState(item?.external_ref_id || '');
  const [selectedProjectId, setSelectedProjectId] = useState(item?.project_id || '');

  const [metadata, setMetadata] = useState<Record<string, any>>(item?.metadata ? { ...item.metadata } : {});
  const [metaDrafts, setMetaDrafts] = useState<Record<string, string>>({});
  const [metaErrors, setMetaErrors] = useState<Record<string, string | null>>({});
  const [newMetaKey, setNewMetaKey] = useState('');
  const [newMetaVal, setNewMetaVal] = useState('');
  const [showAddMeta, setShowAddMeta] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Dynamic project settings resolution
  const effectiveProjectSettings = useMemo(() => {
    if (!selectedProjectId) return projectSettings;
    const matched = projects.find((p) => p.id === selectedProjectId);
    if (matched?.settings && matched.settings.hierarchy?.length && matched.settings.statuses?.length) {
      return matched.settings;
    }
    return projectSettings;
  }, [selectedProjectId, projects, projectSettings]);

  // Keep itemType and status aligned with effectiveProjectSettings
  useEffect(() => {
    if (!effectiveProjectSettings) return;
    if (itemType && effectiveProjectSettings.hierarchy?.length) {
      const isTypeValid = effectiveProjectSettings.hierarchy.some((h) => h.type === itemType);
      if (!isTypeValid) {
        setItemType(effectiveProjectSettings.hierarchy[0]?.type || 'task');
      }
    }
    if (status && effectiveProjectSettings.statuses?.length) {
      const isStatusValid = effectiveProjectSettings.statuses.some((s) => s.id === status);
      if (!isStatusValid) {
        setStatus(effectiveProjectSettings.statuses[0]?.id || 'backlog');
      }
    }
  }, [selectedProjectId, effectiveProjectSettings]);

  const isSprintLocked = item ? isItemImmutableDueToCompletedSprint(item, effectiveProjectSettings) : false;
  const isLocked = isSprintLocked || isReadOnly;

  // Sync form state when item changes
  useEffect(() => {
    if (item) {
      setTitle(item.title || '');
      setDescription(item.description || '');
      setStatus(item.status || projectSettings.statuses[0]?.id || 'backlog');
      setItemType(item.item_type || projectSettings.hierarchy[0]?.type || 'task');
      setParentId(item.parent_id || '');
      setAssignee(item.assignee || '');
      setExternalRef(item.external_ref_id || '');
      setSelectedProjectId(item.project_id || '');
      const rawMeta = item.metadata ? { ...item.metadata } : {};
      setMetadata(rawMeta);
      const drafts: Record<string, string> = {};
      Object.entries(rawMeta).forEach(([k, v]) => {
        drafts[k] = typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v ?? '');
      });
      setMetaDrafts(drafts);
      setMetaErrors({});
      setShowAddMeta(false);
      setSaveError(null);
    }
  }, [item, projectSettings]);

  const [projectCandidateItems, setProjectCandidateItems] = useState<WorkItem[]>([]);
  const [isLoadingParents, setIsLoadingParents] = useState(false);

  // Dynamic parent options when reassigning project
  useEffect(() => {
    if (!item) return;
    const targetProjId = selectedProjectId || item.project_id;
    if (!targetProjId) return;

    const knownMatching = allItems.filter((i) => i.project_id === targetProjId);
    if (parentId && targetProjId !== item.project_id) {
      const parentMatches = knownMatching.some((i) => i.id === parentId);
      if (!parentMatches) {
        setParentId('');
      }
    }

    if (targetProjId === item.project_id) {
      setProjectCandidateItems(allItems.filter((i) => i.project_id === item.project_id));
      setIsLoadingParents(false);
      return;
    }

    if (knownMatching.length > 0) {
      setProjectCandidateItems(knownMatching);
    }

    let isCancelled = false;
    setIsLoadingParents(true);
    fetch(`/api/v1/items?project_id=${targetProjId}`, {
      headers: tenantSlug ? { 'x-tenant-slug': tenantSlug } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isCancelled && data?.items) {
          setProjectCandidateItems(data.items);
          if (parentId && !data.items.some((it: WorkItem) => it.id === parentId)) {
            setParentId('');
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) setIsLoadingParents(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedProjectId, item?.id, item?.project_id, allItems, tenantSlug]);

  const currentHierarchyConfig = effectiveProjectSettings.hierarchy.find((h) => h.type === itemType);
  const allowedParentTypes = currentHierarchyConfig?.allowed_parents || [];
  const targetProjId = selectedProjectId || item?.project_id;
  const parentPool =
    projectCandidateItems.length > 0
      ? projectCandidateItems
      : allItems.filter((other) => other.project_id === targetProjId);

  const eligibleParents = parentPool.filter(
    (other) =>
      other.id !== item?.id &&
      other.project_id === targetProjId &&
      allowedParentTypes.includes(other.item_type)
  );

  const myDisplayName = currentUser?.full_name
    ? `Me (${currentUser.full_name})`
    : currentUser?.email
    ? `Me (${currentUser.email.split('@')[0]})`
    : 'Me';

  const memberNames = Array.from(
    new Set([
      ...workspaceMembers.map((m) => m.full_name).filter(Boolean),
      ...allItems
        .map((i) => i.assignee)
        .filter((a): a is string => typeof a === 'string' && a.length > 0 && !a.startsWith('Me (')),
    ])
  );

  const levelColor = getHierarchyLevelColor(itemType, effectiveProjectSettings.hierarchy);

  const handleSave = async () => {
    if (isLocked) {
      setSaveError(`This item was completed in closed sprint "${item?.metadata?.sprint}" and is immutable.`);
      return;
    }
    if (!title.trim() || !item) return;
    const hasErrors = Object.values(metaErrors).some(Boolean);
    if (hasErrors) {
      setSaveError('Please correct invalid metadata values before saving.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const updates: Partial<WorkItem> = {
        title: title.trim(),
        description: description.trim() || null,
        status,
        item_type: itemType,
        parent_id: parentId || null,
        assignee: assignee || null,
        external_ref_id: externalRef.trim() || null,
        metadata,
      };
      if (selectedProjectId && selectedProjectId !== item.project_id) {
        updates.project_id = selectedProjectId;
      }
      await onSave(item.id, updates);
      onClose();
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMetaField = () => {
    const key = newMetaKey.trim();
    if (!key) return;

    let parsedVal: any = newMetaVal.trim();
    if (parsedVal === 'true') parsedVal = true;
    else if (parsedVal === 'false') parsedVal = false;
    else if (parsedVal === 'null') parsedVal = null;
    else if (!isNaN(Number(parsedVal)) && parsedVal !== '') parsedVal = Number(parsedVal);
    else if (
      (parsedVal.startsWith('{') && parsedVal.endsWith('}')) ||
      (parsedVal.startsWith('[') && parsedVal.endsWith(']'))
    ) {
      try {
        parsedVal = JSON.parse(parsedVal);
      } catch {
        // preserve as string
      }
    }

    setMetadata((prev) => ({ ...prev, [key]: parsedVal }));
    setMetaDrafts((prev) => ({
      ...prev,
      [key]:
        typeof parsedVal === 'object' && parsedVal !== null
          ? JSON.stringify(parsedVal, null, 2)
          : String(parsedVal ?? ''),
    }));
    setMetaErrors((prev) => ({ ...prev, [key]: null }));
    setNewMetaKey('');
    setNewMetaVal('');
    setShowAddMeta(false);
  };

  const handleUpdateMetaField = (key: string, rawText: string) => {
    setMetaDrafts((prev) => ({ ...prev, [key]: rawText }));

    const currentVal = metadata[key];
    const isOriginalObject = typeof currentVal === 'object' && currentVal !== null;
    const looksLikeJson = rawText.trim().startsWith('{') || rawText.trim().startsWith('[');

    if (isOriginalObject || looksLikeJson) {
      try {
        const parsed = JSON.parse(rawText);
        setMetadata((prev) => ({ ...prev, [key]: parsed }));
        setMetaErrors((prev) => ({ ...prev, [key]: null }));
      } catch {
        setMetaErrors((prev) => ({ ...prev, [key]: 'Invalid JSON format' }));
      }
      return;
    }

    if (typeof currentVal === 'number') {
      const trimmed = rawText.trim();
      if (trimmed === '') {
        setMetadata((prev) => ({ ...prev, [key]: null }));
        setMetaErrors((prev) => ({ ...prev, [key]: null }));
      } else {
        const num = Number(trimmed);
        if (isNaN(num)) {
          setMetaErrors((prev) => ({ ...prev, [key]: 'Must be a valid number' }));
        } else {
          setMetadata((prev) => ({ ...prev, [key]: num }));
          setMetaErrors((prev) => ({ ...prev, [key]: null }));
        }
      }
      return;
    }

    if (currentVal === null) {
      const trimmed = rawText.trim();
      if (trimmed === '') {
        setMetadata((prev) => ({ ...prev, [key]: null }));
        setMetaErrors((prev) => ({ ...prev, [key]: null }));
        return;
      }
      if (rawText === 'true' || rawText === 'false') {
        setMetadata((prev) => ({ ...prev, [key]: rawText === 'true' }));
        setMetaErrors((prev) => ({ ...prev, [key]: null }));
        return;
      }
      setMetadata((prev) => ({ ...prev, [key]: rawText }));
      setMetaErrors((prev) => ({ ...prev, [key]: null }));
      return;
    }

    if (typeof currentVal === 'boolean') {
      const boolVal = rawText === 'true';
      setMetadata((prev) => ({ ...prev, [key]: boolVal }));
      setMetaErrors((prev) => ({ ...prev, [key]: null }));
      return;
    }

    // Default string
    setMetadata((prev) => ({ ...prev, [key]: rawText }));
    setMetaErrors((prev) => ({ ...prev, [key]: null }));
  };

  const handleRemoveMetaField = (key: string) => {
    setMetadata((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setMetaDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setMetaErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return {
    title,
    setTitle,
    description,
    setDescription,
    status,
    setStatus,
    itemType,
    setItemType,
    parentId,
    setParentId,
    assignee,
    setAssignee,
    externalRef,
    setExternalRef,
    selectedProjectId,
    setSelectedProjectId,
    metadata,
    metaDrafts,
    metaErrors,
    newMetaKey,
    setNewMetaKey,
    newMetaVal,
    setNewMetaVal,
    showAddMeta,
    setShowAddMeta,
    isSaving,
    saveError,
    setSaveError,
    effectiveProjectSettings,
    allowedParentTypes,
    eligibleParents,
    isLoadingParents,
    myDisplayName,
    memberNames,
    levelColor,
    isLocked,
    isSprintLocked,
    handleSave,
    handleAddMetaField,
    handleUpdateMetaField,
    handleRemoveMetaField,
  };
}
