'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Plus, User, ChevronDown, Loader2 } from 'lucide-react';
import { HierarchyLevel, StatusDefinition } from '@/types/tracker';

export interface ProjectOption {
  id: string;
  name: string;
  slug: string;
  settings?: {
    hierarchy?: HierarchyLevel[];
    statuses?: StatusDefinition[];
    [key: string]: any;
  };
}

export interface WorkspaceMemberOption {
  user_id: string;
  full_name: string;
}

export interface QuickAddPayload {
  project_slug: string;
  title: string;
  item_type: string;
  status: string;
  assignee: string | null;
  external_ref_id: string | null;
}

export interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: QuickAddPayload) => Promise<any>;
  currentProjectSlug: string;
  isAllProjects?: boolean;
  allProjects?: ProjectOption[];
  hierarchy: HierarchyLevel[];
  statuses: StatusDefinition[];
  workspaceMembers?: WorkspaceMemberOption[];
  myDisplayName?: string;
  getHierarchyForProject?: (projectSlug: string) => HierarchyLevel[];
  getStatusesForProject?: (projectSlug: string) => StatusDefinition[];
}

const EMPTY_PROJECTS: ProjectOption[] = [];
const EMPTY_MEMBERS: WorkspaceMemberOption[] = [];

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  currentProjectSlug,
  isAllProjects = false,
  allProjects = EMPTY_PROJECTS,
  hierarchy: defaultHierarchy,
  statuses: defaultStatuses,
  workspaceMembers = EMPTY_MEMBERS,
  myDisplayName = 'Me',
  getHierarchyForProject,
  getStatusesForProject,
}) => {
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string>(currentProjectSlug);
  const [title, setTitle] = useState('');
  const [itemType, setItemType] = useState('task');
  const [status, setStatus] = useState('not_started');
  const [assignee, setAssignee] = useState(myDisplayName);
  const [externalRef, setExternalRef] = useState('');
  const [createAnother, setCreateAnother] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);
  const prevIsOpenRef = useRef(false);

  // Compute effective hierarchy for selected project
  const currentHierarchy = useMemo(() => {
    if (getHierarchyForProject && selectedProjectSlug) {
      const h = getHierarchyForProject(selectedProjectSlug);
      if (h && h.length > 0) return h;
    }
    if (isAllProjects && allProjects.length > 0) {
      const proj = allProjects.find((p) => p.slug === selectedProjectSlug);
      if (proj?.settings?.hierarchy && proj.settings.hierarchy.length > 0) {
        return proj.settings.hierarchy;
      }
    }
    return defaultHierarchy;
  }, [getHierarchyForProject, selectedProjectSlug, isAllProjects, allProjects, defaultHierarchy]);

  // Compute effective statuses for selected project
  const currentStatuses = useMemo(() => {
    if (getStatusesForProject && selectedProjectSlug) {
      const s = getStatusesForProject(selectedProjectSlug);
      if (s && s.length > 0) return s;
    }
    if (isAllProjects && allProjects.length > 0) {
      const proj = allProjects.find((p) => p.slug === selectedProjectSlug);
      if (proj?.settings?.statuses && proj.settings.statuses.length > 0) {
        return proj.settings.statuses;
      }
    }
    return defaultStatuses;
  }, [getStatusesForProject, selectedProjectSlug, isAllProjects, allProjects, defaultStatuses]);

  // Initialize or reset fields only when modal opens
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      const initialProject = isAllProjects
        ? currentProjectSlug || allProjects[0]?.slug || 'sunshade-tracker'
        : currentProjectSlug;
      setSelectedProjectSlug(initialProject);
      setTitle('');
      setExternalRef('');
      setErrorMessage(null);
      setAssigneeDropdownOpen(false);

      // Default type to lowest level (usually task) if available
      if (currentHierarchy.length > 0) {
        setItemType(currentHierarchy[currentHierarchy.length - 1].type);
      } else {
        setItemType('task');
      }

      // Default status to first status (usually not_started)
      if (currentStatuses.length > 0) {
        setStatus(currentStatuses[0].id);
      } else {
        setStatus('not_started');
      }

      setAssignee(myDisplayName);

      // Auto-focus title input
      const timer = setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, currentProjectSlug, isAllProjects, allProjects, currentHierarchy, currentStatuses, myDisplayName]);

  // Ensure itemType and status stay valid if hierarchy/statuses change (e.g. project change)
  useEffect(() => {
    if (currentHierarchy.length > 0 && !currentHierarchy.some((h) => h.type === itemType)) {
      setItemType(currentHierarchy[currentHierarchy.length - 1].type);
    }
  }, [currentHierarchy, itemType]);

  useEffect(() => {
    if (currentStatuses.length > 0 && !currentStatuses.some((s) => s.id === status)) {
      setStatus(currentStatuses[0].id);
    }
  }, [currentStatuses, status]);

  // Handle outside click for assignee dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(e.target as Node)) {
        setAssigneeDropdownOpen(false);
      }
    };
    if (assigneeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [assigneeDropdownOpen]);

  // Handle global Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (assigneeDropdownOpen) {
          setAssigneeDropdownOpen(false);
          e.stopPropagation();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, assigneeDropdownOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (keepOpen = false) => {
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const targetProjectSlug = isAllProjects
      ? selectedProjectSlug || allProjects[0]?.slug || 'sunshade-tracker'
      : currentProjectSlug;

    try {
      await onSubmit({
        project_slug: targetProjectSlug,
        title: title.trim(),
        item_type: itemType,
        status,
        assignee: assignee || null,
        external_ref_id: externalRef.trim() || null,
      });

      if (keepOpen || createAnother) {
        setTitle('');
        setExternalRef('');
        titleInputRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err: any) {
      console.error('Error in QuickAddModal onSubmit:', err);
      setErrorMessage(err?.message || 'Failed to create work item. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift + Enter triggers continuous entry
        handleSubmit(true);
      } else {
        handleSubmit(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-modal-title"
      data-testid="quick-add-modal"
    >
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Plus className="w-4 h-4" />
            </div>
            <h2 id="quick-add-modal-title" className="text-base font-semibold text-white">
              Create Work Item
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close dialog"
            data-testid="quick-add-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-white ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Form Body */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(false);
          }}
          className="p-6 space-y-4"
        >
          {/* Project Selector (Portfolio / All Projects mode) */}
          {isAllProjects && allProjects.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Target Project
              </label>
              <select
                value={selectedProjectSlug}
                onChange={(e) => setSelectedProjectSlug(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-emerald-300 focus:outline-none focus:border-emerald-500 font-sans cursor-pointer font-medium"
                data-testid="quick-add-project-select"
              >
                {allProjects.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.name} ({p.slug})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Title <span className="text-emerald-400">*</span></span>
              <span className="text-[10px] text-slate-500 font-normal lowercase">Press Enter to create</span>
            </label>
            <input
              ref={titleInputRef}
              type="text"
              autoFocus
              required
              placeholder="What needs to be done? (e.g. Implement Webhook Dispatcher)..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors shadow-inner"
              data-testid="quick-add-title-input"
            />
          </div>

          {/* Grid: Type & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Hierarchy Type
              </label>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500 font-mono cursor-pointer"
                data-testid="quick-add-type-select"
              >
                {currentHierarchy.map((h) => (
                  <option key={h.type} value={h.type}>
                    {h.label} (Level {h.level})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Initial Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500 font-mono cursor-pointer"
                data-testid="quick-add-status-select"
              >
                {currentStatuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Grid: Assignee & External Ref */}
          <div className="grid grid-cols-2 gap-3">
            {/* Assignee Picker */}
            <div className="space-y-1.5" ref={assigneeDropdownRef}>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Assignee
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAssigneeDropdownOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-200 focus:outline-none transition-colors"
                  data-testid="quick-add-assignee-btn"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{assignee || 'Unassigned'}</span>
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${
                      assigneeDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {assigneeDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-full min-w-[200px] rounded-xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/80 z-50 p-1.5 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Select Assignee
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAssignee(myDisplayName);
                        setAssigneeDropdownOpen(false);
                      }}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                        assignee === myDisplayName
                          ? 'bg-emerald-500/15 text-emerald-300 font-medium'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[9px] font-bold">
                        Me
                      </div>
                      <span className="truncate">{myDisplayName}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAssignee('');
                        setAssigneeDropdownOpen(false);
                      }}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                        !assignee
                          ? 'bg-emerald-500/15 text-emerald-300 font-medium'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[9px]">
                        —
                      </div>
                      <span className="italic">Unassigned</span>
                    </button>

                    {workspaceMembers.filter((m) => m.full_name && m.full_name !== myDisplayName).length > 0 && (
                      <div className="border-t border-slate-800 my-1 pt-1">
                        <div className="px-2 py-0.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                          Workspace Members
                        </div>
                        {workspaceMembers
                          .filter((m) => m.full_name && m.full_name !== myDisplayName)
                          .map((m) => (
                            <button
                              key={m.user_id}
                              type="button"
                              onClick={() => {
                                setAssignee(m.full_name);
                                setAssigneeDropdownOpen(false);
                              }}
                              className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                                assignee === m.full_name
                                  ? 'bg-emerald-500/15 text-emerald-300 font-medium'
                                  : 'text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <div className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[9px] font-bold">
                                {m.full_name[0]?.toUpperCase() || 'M'}
                              </div>
                              <span className="truncate">{m.full_name}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* External Ref ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                External Ref
              </label>
              <input
                type="text"
                placeholder="e.g. SPEC-01"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500 font-mono transition-colors"
                data-testid="quick-add-ref-input"
              />
            </div>
          </div>

          {/* Footer Controls: Create Another & Action Buttons */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
            <label className="flex items-center space-x-2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={createAnother}
                onChange={(e) => setCreateAnother(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/20 w-3.5 h-3.5 cursor-pointer"
                data-testid="quick-add-create-another-checkbox"
              />
              <span>Create another item</span>
              <span className="hidden sm:inline text-[10px] text-slate-500 font-mono">
                (Shift+Enter)
              </span>
            </label>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 rounded-lg border border-slate-800 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || isSubmitting}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer"
                data-testid="quick-add-submit-btn"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
