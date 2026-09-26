'use client';

import { useState, useEffect, useRef } from 'react';
import { WorkItem, ProjectSettings, AuditLogEntry } from '@/types/tracker';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { AssociatedItemsTab } from '@/components/modal/tabs/AssociatedItemsTab';
import { ActivityLogTab } from '@/components/modal/tabs/ActivityLogTab';
import { ItemDetailsTab } from '@/components/modal/tabs/ItemDetailsTab';
import { WorkItemModalHeader } from '@/components/modal/WorkItemModalHeader';
import { WorkItemModalFooter } from '@/components/modal/WorkItemModalFooter';
import { useWorkItemForm } from '@/hooks/useWorkItemForm';
import { QuickAddPayload } from '@/components/QuickAddModal';
import { extractGitHubMetadata } from '@/lib/github-metadata';
import { useModalScrollLock } from '@/hooks/useModalScrollLock';

export interface ProjectInfo {
  id: string;
  slug: string;
  name: string;
  settings?: ProjectSettings;
}

export interface WorkItemModalProps {
  item: WorkItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<WorkItem>) => Promise<void> | void;
  onDelete: (id: string) => Promise<boolean | void> | boolean | void;
  projectSettings: ProjectSettings;
  allItems: WorkItem[];
  currentUser?: { full_name?: string; email?: string };
  workspaceMembers?: { full_name: string; email?: string }[];
  tenantSlug?: string;
  isReadOnly?: boolean;
  isAllProjects?: boolean;
  projects?: ProjectInfo[];
  onSelectItem?: (item: WorkItem) => void;
  onCreateChildItem?: (payload: QuickAddPayload) => Promise<WorkItem | void>;
  onRefresh?: () => Promise<void> | void;
  initialTab?: 'details' | 'associated' | 'children' | 'activity';
}

export function WorkItemModal(props: WorkItemModalProps) {
  const {
    item,
    isOpen,
    onClose,
    onDelete,
    allItems = [],
    workspaceMembers = [],
    tenantSlug,
    isReadOnly = false,
    isAllProjects = false,
    projects = [],
    onSelectItem,
    onCreateChildItem,
    onRefresh,
    initialTab = 'details',
  } = props;

  const [activeTab, setActiveTab] = useState<'details' | 'associated' | 'children' | 'activity'>(initialTab);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const lastFetchedItemIdRef = useRef<string | null>(null);

  // Background scroll lock and outside-hover isolation (TRK-18)
  useModalScrollLock(Boolean(isOpen && item));

  const form = useWorkItemForm({
    item,
    isOpen,
    projectSettings: props.projectSettings,
    allItems,
    currentUser: props.currentUser,
    workspaceMembers,
    tenantSlug,
    isReadOnly,
    isAllProjects,
    projects,
    onSave: props.onSave,
    onClose,
  });

  const fetchAuditLogs = async (itemId: string) => {
    lastFetchedItemIdRef.current = itemId;
    setIsLoadingLogs(true);
    try {
      const res = await fetch(`/api/v1/audit-logs?item_id=${itemId}`, {
        headers: tenantSlug ? { 'x-tenant-slug': tenantSlug } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (lastFetchedItemIdRef.current === itemId) {
          setAuditLogs(data.audit_logs || []);
        }
      }
    } catch {
      // Graceful ignore
    } finally {
      if (lastFetchedItemIdRef.current === itemId) {
        setIsLoadingLogs(false);
      }
    }
  };

  useEffect(() => {
    if (item?.id) {
      setActiveTab(initialTab);
      fetchAuditLogs(item.id);
    } else {
      setAuditLogs([]);
    }
  }, [item?.id, initialTab]);

  // Handle ESC and Cmd+Enter shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen || showConfirmDelete) return;
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        form.handleSave();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showConfirmDelete, form.handleSave, onClose]);

  if (!isOpen || !item) return null;

  const childItems = allItems.filter((it) => it.parent_id === item.id);
  const isAssociatedTab = activeTab === 'associated' || activeTab === 'children';
  const projectGithubRepo = form.effectiveProjectSettings?.github_repo || form.effectiveProjectSettings?.github_repository;
  const { prUrl, commitHash, repo, owner } = extractGitHubMetadata(form.metadata, projectGithubRepo);

  const handleDelete = async () => {
    try {
      const deleted = await onDelete(item.id);
      if (deleted !== false) {
        onClose();
      }
    } finally {
      setShowConfirmDelete(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onWheel={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      data-testid="work-item-modal-backdrop"
    >
      <div
        data-modal-content="true"
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        <WorkItemModalHeader
          item={item}
          itemType={form.itemType}
          levelColor={form.levelColor}
          isLocked={form.isLocked}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          childCount={childItems.length}
          auditLogsCount={auditLogs.length}
          tenantSlug={tenantSlug}
          projectSettings={form.effectiveProjectSettings}
          onClose={onClose}
          onRequestDelete={() => setShowConfirmDelete(true)}
          onRefreshAuditLogs={fetchAuditLogs}
        />

        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {isAssociatedTab ? (
            <AssociatedItemsTab
              item={item}
              allItems={allItems}
              projectSettings={form.effectiveProjectSettings}
              workspaceMembers={workspaceMembers}
              isReadOnly={isReadOnly}
              tenantSlug={tenantSlug}
              onSelectItem={onSelectItem}
              onCreateChildItem={onCreateChildItem}
              onRefresh={onRefresh}
            />
          ) : activeTab === 'activity' ? (
            <ActivityLogTab
              itemId={item.id}
              auditLogs={auditLogs}
              isLoadingLogs={isLoadingLogs}
              effectiveProjectSettings={form.effectiveProjectSettings}
              onRefreshLogs={fetchAuditLogs}
            />
          ) : (
            <ItemDetailsTab
              item={item}
              title={form.title}
              onTitleChange={form.setTitle}
              description={form.description}
              onDescriptionChange={form.setDescription}
              status={form.status}
              onStatusChange={form.setStatus}
              itemType={form.itemType}
              onItemTypeChange={form.setItemType}
              parentId={form.parentId}
              onParentIdChange={form.setParentId}
              assignee={form.assignee}
              onAssigneeChange={form.setAssignee}
              externalRef={form.externalRef}
              onExternalRefChange={form.setExternalRef}
              selectedProjectId={form.selectedProjectId}
              onSelectedProjectIdChange={form.setSelectedProjectId}
              projects={projects}
              effectiveProjectSettings={form.effectiveProjectSettings}
              allowedParentTypes={form.allowedParentTypes}
              eligibleParents={form.eligibleParents}
              isLoadingParents={form.isLoadingParents}
              myDisplayName={form.myDisplayName}
              canonicalUserHandle={form.canonicalUserHandle}
              memberNames={form.memberNames}
              isAllProjects={isAllProjects}
              metadata={form.metadata}
              metaDrafts={form.metaDrafts}
              metaErrors={form.metaErrors}
              onUpdateMetaField={form.handleUpdateMetaField}
              onRemoveMetaField={form.handleRemoveMetaField}
              showAddMeta={form.showAddMeta}
              onToggleAddMeta={() => form.setShowAddMeta(!form.showAddMeta)}
              newMetaKey={form.newMetaKey}
              onNewMetaKeyChange={form.setNewMetaKey}
              newMetaVal={form.newMetaVal}
              onNewMetaValChange={form.setNewMetaVal}
              onAddMetaField={form.handleAddMetaField}
              isLocked={form.isLocked}
              isReadOnly={isReadOnly}
              saveError={form.saveError}
              modalPrUrl={prUrl}
              modalCommitHash={commitHash}
              modalRepo={repo}
              modalOwner={owner}
            />
          )}
        </div>

        <WorkItemModalFooter
          item={item}
          activeTab={activeTab}
          isSaving={form.isSaving}
          isLocked={form.isLocked}
          canSave={Boolean(form.title.trim())}
          onClose={onClose}
          onSave={form.handleSave}
          onSwitchToDetails={() => setActiveTab('details')}
        />
      </div>

      {item && (
        <ConfirmDeleteModal
          isOpen={showConfirmDelete}
          itemTitle={item.title}
          itemRef={item.external_ref_id}
          onClose={() => setShowConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
