'use client';

import { useState } from 'react';
import { WorkItem, HierarchyLevel, StatusDefinition } from '@/types/tracker';

export interface ModalControllerState {
  editingItem: WorkItem | null;
  setEditingItem: (item: WorkItem | null) => void;
  deleteConfirmItem: WorkItem | null;
  setDeleteConfirmItem: (item: WorkItem | null) => void;
  isQuickAddOpen: boolean;
  setIsQuickAddOpen: (open: boolean) => void;
  quickAddInitialStatus?: string;
  setQuickAddInitialStatus: (status?: string) => void;
  quickAddInitialSprint?: string;
  setQuickAddInitialSprint: (sprint?: string) => void;
  quickAddParentItem: WorkItem | null;
  setQuickAddParentItem: (item: WorkItem | null) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  isArchiveModalOpen: boolean;
  setIsArchiveModalOpen: (open: boolean) => void;
  isManageSprintsOpen: boolean;
  setIsManageSprintsOpen: (open: boolean) => void;
  isReconciliationModalOpen: boolean;
  setIsReconciliationModalOpen: (open: boolean) => void;
  focusedDeviationId: string | null;
  setFocusedDeviationId: (id: string | null) => void;
  cascadeStatusTarget: { item: WorkItem; newStatus: string } | null;
  setCascadeStatusTarget: (target: { item: WorkItem; newStatus: string } | null) => void;
  cascadeStatusChildren: WorkItem[];
  setCascadeStatusChildren: (children: WorkItem[]) => void;
  cascadePromptTarget: { item: WorkItem; newStatus: string } | null;
  setCascadePromptTarget: (target: { item: WorkItem; newStatus: string } | null) => void;
  cascadePromptChildren: WorkItem[];
  setCascadePromptChildren: (children: WorkItem[]) => void;
  showCascadeCompletionModal: boolean;
  setShowCascadeCompletionModal: (open: boolean) => void;
  showCascadePromptModal: boolean;
  setShowCascadePromptModal: (open: boolean) => void;
}

export function useModalController(): ModalControllerState {
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<WorkItem | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddInitialStatus, setQuickAddInitialStatus] = useState<string | undefined>(undefined);
  const [quickAddInitialSprint, setQuickAddInitialSprint] = useState<string | undefined>(undefined);
  const [quickAddParentItem, setQuickAddParentItem] = useState<WorkItem | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isManageSprintsOpen, setIsManageSprintsOpen] = useState(false);
  const [isReconciliationModalOpen, setIsReconciliationModalOpen] = useState(false);
  const [focusedDeviationId, setFocusedDeviationId] = useState<string | null>(null);

  const [cascadeStatusTarget, setCascadeStatusTarget] = useState<{ item: WorkItem; newStatus: string } | null>(null);
  const [cascadeStatusChildren, setCascadeStatusChildren] = useState<WorkItem[]>([]);
  const [cascadePromptTarget, setCascadePromptTarget] = useState<{ item: WorkItem; newStatus: string } | null>(null);
  const [cascadePromptChildren, setCascadePromptChildren] = useState<WorkItem[]>([]);
  const [showCascadeCompletionModal, setShowCascadeCompletionModal] = useState(false);
  const [showCascadePromptModal, setShowCascadePromptModal] = useState(false);

  return {
    editingItem,
    setEditingItem,
    deleteConfirmItem,
    setDeleteConfirmItem,
    isQuickAddOpen,
    setIsQuickAddOpen,
    quickAddInitialStatus,
    setQuickAddInitialStatus,
    quickAddInitialSprint,
    setQuickAddInitialSprint,
    quickAddParentItem,
    setQuickAddParentItem,
    isSearchOpen,
    setIsSearchOpen,
    isArchiveModalOpen,
    setIsArchiveModalOpen,
    isManageSprintsOpen,
    setIsManageSprintsOpen,
    isReconciliationModalOpen,
    setIsReconciliationModalOpen,
    focusedDeviationId,
    setFocusedDeviationId,
    cascadeStatusTarget,
    setCascadeStatusTarget,
    cascadeStatusChildren,
    setCascadeStatusChildren,
    cascadePromptTarget,
    setCascadePromptTarget,
    cascadePromptChildren,
    setCascadePromptChildren,
    showCascadeCompletionModal,
    setShowCascadeCompletionModal,
    showCascadePromptModal,
    setShowCascadePromptModal,
  };
}
