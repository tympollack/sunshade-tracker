'use client';

import React from 'react';
import { WorkItem, ProjectSettings, SprintDefinition, HierarchyLevel, StatusDefinition } from '@/types/tracker';
import { WorkItemModal, ProjectInfo } from '@/components/WorkItemModal';
import { QuickAddModal, QuickAddPayload } from '@/components/QuickAddModal';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { CascadeCompletionModal } from '@/components/CascadeCompletionModal';
import { CascadePromptModal } from '@/components/CascadePromptModal';
import { ConfirmArchiveProjectModal } from '@/components/ConfirmArchiveProjectModal';
import { SchemaReconciliationModal } from '@/components/SchemaReconciliationModal';
import { ManageSprintsModal } from '@/components/ManageSprintsModal';
import { GlobalSearchModal } from '@/components/GlobalSearchModal';
import { SchemaDeviation } from '@/lib/schema-deviation';

export interface ProjectModalsProps {
  isReadOnly: boolean;
  tenantSlug: string;
  projectSlug: string;
  items: WorkItem[];
  allProjects: ProjectInfo[];
  projectSettings: ProjectSettings;
  modalProjectSettings: ProjectSettings;
  currentUser: { email?: string; full_name?: string } | null;
  workspaceMembers: { user_id: string; full_name: string; email?: string }[];
  // Editing item
  editingItem: WorkItem | null;
  setEditingItem: (item: WorkItem | null) => void;
  handleSaveModalItem: (id: string, updates: Partial<WorkItem>) => Promise<void>;
  handleDeleteItem: (id: string) => Promise<boolean | void>;
  handleModalCreateChildItem: (payload: QuickAddPayload) => Promise<WorkItem | void>;
  fetchData: () => Promise<void>;
  // Quick Add
  isQuickAddOpen: boolean;
  setIsQuickAddOpen: (open: boolean) => void;
  quickAddInitialStatus?: string;
  setQuickAddInitialStatus: (status?: string) => void;
  quickAddInitialSprint?: string;
  setQuickAddInitialSprint: (sprint?: string) => void;
  quickAddParentItem: WorkItem | null;
  setQuickAddParentItem: (item: WorkItem | null) => void;
  handleCreateItem: (payload: QuickAddPayload) => Promise<void>;
  // Delete confirm
  deleteConfirmItem: WorkItem | null;
  setDeleteConfirmItem: (item: WorkItem | null) => void;
  // Cascade
  showCascadeCompletionModal: boolean;
  setShowCascadeCompletionModal: (open: boolean) => void;
  cascadeStatusTarget: { item: WorkItem; newStatus: string } | null;
  setCascadeStatusTarget: (target: { item: WorkItem; newStatus: string } | null) => void;
  cascadeStatusChildren: WorkItem[];
  setCascadeStatusChildren: (children: WorkItem[]) => void;
  handleExecuteCascadeCompletion: () => Promise<void>;
  handleExecuteKeepParentOnly: () => Promise<void>;
  showCascadePromptModal: boolean;
  setShowCascadePromptModal: (open: boolean) => void;
  cascadePromptTarget: { item: WorkItem; newStatus: string } | null;
  setCascadePromptTarget: (target: { item: WorkItem; newStatus: string } | null) => void;
  cascadePromptChildren: WorkItem[];
  setCascadePromptChildren: (children: WorkItem[]) => void;
  handleExecuteCascadePrompt: () => Promise<void>;
  handleExecuteKeepParentOnlyPrompt?: () => Promise<void>;
  cascadePromptType?: 'advance_children_to_in_progress' | 'advance_parent_to_complete';
  // Archive
  isArchiveModalOpen: boolean;
  setIsArchiveModalOpen: (open: boolean) => void;
  currentProject?: { name: string; slug: string };
  handleArchiveProject: () => Promise<void>;
  // Schema Reconciliation
  isReconciliationModalOpen: boolean;
  setIsReconciliationModalOpen: (open: boolean) => void;
  deviations: SchemaDeviation[];
  focusedDeviationId: string | null;
  setFocusedDeviationId: (id: string | null) => void;
  isAllProjects?: boolean;
  selectedSchemaProjectSlug?: string;
  onReconciled?: () => Promise<void> | void;
  handleApplyReconciliation?: (dev: SchemaDeviation, fix: any) => Promise<void>;
  handleBatchReconcile?: (fixes: any[]) => Promise<void>;
  // Manage Sprints
  isManageSprintsOpen: boolean;
  setIsManageSprintsOpen: (open: boolean) => void;
  handleSaveSprints: (sprints: SprintDefinition[]) => Promise<void>;
  // Global Search
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  // Quick Add helpers
  myDisplayName?: string;
  getHierarchyForProject?: (projectSlug: string) => HierarchyLevel[];
  getStatusesForProject?: (projectSlug: string) => StatusDefinition[];
  // Archive in-flight state
  isArchiving?: boolean;
}

export function ProjectModals(props: ProjectModalsProps) {
  const {
    isReadOnly,
    tenantSlug,
    projectSlug,
    items,
    allProjects,
    projectSettings,
    modalProjectSettings,
    currentUser,
    workspaceMembers,
    editingItem,
    setEditingItem,
    handleSaveModalItem,
    handleDeleteItem,
    handleModalCreateChildItem,
    fetchData,
    isQuickAddOpen,
    setIsQuickAddOpen,
    quickAddInitialStatus,
    setQuickAddInitialStatus,
    quickAddInitialSprint,
    setQuickAddInitialSprint,
    quickAddParentItem,
    setQuickAddParentItem,
    handleCreateItem,
    deleteConfirmItem,
    setDeleteConfirmItem,
    showCascadeCompletionModal,
    setShowCascadeCompletionModal,
    cascadeStatusTarget,
    setCascadeStatusTarget,
    cascadeStatusChildren,
    setCascadeStatusChildren,
    handleExecuteCascadeCompletion,
    handleExecuteKeepParentOnly,
    showCascadePromptModal,
    setShowCascadePromptModal,
    cascadePromptTarget,
    setCascadePromptTarget,
    cascadePromptChildren,
    setCascadePromptChildren,
    handleExecuteCascadePrompt,
    handleExecuteKeepParentOnlyPrompt,
    cascadePromptType,
    isArchiveModalOpen,
    setIsArchiveModalOpen,
    currentProject,
    handleArchiveProject,
    isReconciliationModalOpen,
    setIsReconciliationModalOpen,
    deviations,
    focusedDeviationId,
    setFocusedDeviationId,
    isAllProjects = false,
    selectedSchemaProjectSlug,
    onReconciled,
    handleApplyReconciliation,
    handleBatchReconcile,
    isManageSprintsOpen,
    setIsManageSprintsOpen,
    handleSaveSprints,
    isSearchOpen,
    setIsSearchOpen,
    myDisplayName,
    getHierarchyForProject,
    getStatusesForProject,
    isArchiving = false,
  } = props;

  return (
    <>
      {/* Work Item Detail / Edit Modal */}
      <WorkItemModal
        item={editingItem}
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        onSave={handleSaveModalItem}
        onDelete={handleDeleteItem}
        projectSettings={modalProjectSettings}
        allItems={items}
        currentUser={currentUser ?? undefined}
        workspaceMembers={workspaceMembers}
        tenantSlug={tenantSlug}
        isReadOnly={isReadOnly}
        isAllProjects={isAllProjects}
        projects={allProjects}
        onSelectItem={(it) => setEditingItem(it)}
        onCreateChildItem={handleModalCreateChildItem}
        onRefresh={fetchData}
      />

      {!isReadOnly && (
        <QuickAddModal
          isOpen={isQuickAddOpen}
          onClose={() => setIsQuickAddOpen(false)}
          onSubmit={handleCreateItem}
          currentProjectSlug={projectSlug}
          isAllProjects={isAllProjects}
          allProjects={allProjects}
          hierarchy={projectSettings.hierarchy || []}
          statuses={projectSettings.statuses || []}
          workspaceMembers={workspaceMembers}
          myDisplayName={myDisplayName}
          getHierarchyForProject={getHierarchyForProject}
          getStatusesForProject={getStatusesForProject}
        />
      )}

      {/* Delete Item Confirmation Modal */}
      {deleteConfirmItem && (
        <ConfirmDeleteModal
          isOpen={!isReadOnly && !!deleteConfirmItem}
          itemTitle={deleteConfirmItem?.title || ''}
          itemRef={deleteConfirmItem?.external_ref_id}
          onClose={() => setDeleteConfirmItem(null)}
          onConfirm={async () => {
            const id = deleteConfirmItem.id;
            setDeleteConfirmItem(null);
            await handleDeleteItem(id);
          }}
        />
      )}

      {/* Cascade Completion Modal */}
      <CascadeCompletionModal
        isOpen={!isReadOnly && showCascadeCompletionModal && !!cascadeStatusTarget}
        parentItem={cascadeStatusTarget?.item || null}
        targetStatus={cascadeStatusTarget?.newStatus || ''}
        unfinishedChildren={cascadeStatusChildren}
        onCancel={() => {
          setShowCascadeCompletionModal(false);
          setCascadeStatusTarget(null);
          setCascadeStatusChildren([]);
        }}
        onCompleteAllChildren={handleExecuteCascadeCompletion}
        onCompleteParentAnyway={handleExecuteKeepParentOnly}
      />

      {/* Cascade Prompt Modal */}
      <CascadePromptModal
        isOpen={!isReadOnly && showCascadePromptModal && !!cascadePromptTarget}
        type={cascadePromptType || 'advance_children_to_in_progress'}
        targetItem={cascadePromptTarget?.item || null}
        relatedItems={cascadePromptChildren}
        onCancel={() => {
          setShowCascadePromptModal(false);
          setCascadePromptTarget(null);
          setCascadePromptChildren([]);
        }}
        onConfirm={handleExecuteCascadePrompt}
        onDecline={() => {
          if (handleExecuteKeepParentOnlyPrompt) {
            handleExecuteKeepParentOnlyPrompt();
          } else {
            setShowCascadePromptModal(false);
            setCascadePromptTarget(null);
            setCascadePromptChildren([]);
          }
        }}
      />

      {/* Confirm Archive Project Modal */}
      <ConfirmArchiveProjectModal
        isOpen={!isReadOnly && isArchiveModalOpen}
        projectName={currentProject?.name || projectSlug}
        projectSlug={projectSlug}
        onClose={() => setIsArchiveModalOpen(false)}
        onConfirm={handleArchiveProject}
        isArchiving={isArchiving}
      />

      {/* Schema Reconciliation Modal */}
      <SchemaReconciliationModal
        isOpen={!isReadOnly && isReconciliationModalOpen}
        onClose={() => {
          setIsReconciliationModalOpen(false);
          setFocusedDeviationId(null);
        }}
        deviations={deviations}
        projectSettings={projectSettings}
        projectIdOrSlug={isAllProjects ? selectedSchemaProjectSlug || allProjects[0]?.slug : projectSlug}
        tenantSlug={tenantSlug}
        allProjects={allProjects}
        isPortfolio={isAllProjects}
        focusDeviationId={focusedDeviationId}
        onReconciled={async () => {
          if (onReconciled) {
            await onReconciled();
          } else {
            await fetchData();
          }
        }}
      />

      {/* Standalone Sprint Definitions Modal */}
      <ManageSprintsModal
        isOpen={!isReadOnly && isManageSprintsOpen}
        onClose={() => setIsManageSprintsOpen(false)}
        sprints={projectSettings.sprint_settings?.sprints || []}
        onSaveSprints={handleSaveSprints}
        items={items}
      />

      {/* Global Search Pop-Open Modal */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        items={items}
        onSelectItem={(item) => setEditingItem(item)}
        projectSettings={projectSettings}
      />
    </>
  );
}
