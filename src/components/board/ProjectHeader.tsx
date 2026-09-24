'use client';

import React from 'react';
import Link from 'next/link';
import {
  Kanban,
  GitFork,
  Calendar,
  Search,
  Plus,
  AlertTriangle,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { SunShadeLogo } from '@/components/SunShadeLogo';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { NavToolsDropdown } from '@/components/NavToolsDropdown';
import { NotificationBell } from '@/components/NotificationBell';
import { UserMenu } from '@/components/UserMenu';
import { SchemaDeviation } from '@/lib/schema-deviation';
import { WorkItem } from '@/types/tracker';

export interface WorkspaceItem {
  id: string;
  slug: string;
  name: string;
  tier: string;
  api_key_preview: string | null;
  role?: string;
  projects?: { id: string; slug: string; name: string }[];
}

export interface ProjectHeaderProps {
  tenantSlug: string;
  projectSlug: string;
  allWorkspaces: WorkspaceItem[];
  allProjects: { id: string; slug: string; name: string }[];
  isReadOnly: boolean;
  activeTab: 'board' | 'tree' | 'sprint' | 'spark' | 'schema';
  onTabChange: (tab: 'board' | 'tree' | 'sprint' | 'spark' | 'schema') => void;
  onOpenSearch: () => void;
  onOpenQuickAdd: () => void;
  deviations: SchemaDeviation[];
  onOpenReconciliation: () => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  items: WorkItem[];
  onSelectItem: (item: WorkItem) => void;
  loading: boolean;
  currentUser: { email?: string; full_name?: string } | null;
  tenantInfo: WorkspaceItem | null;
  onArchiveProject: () => void;
}

export function ProjectHeader(props: ProjectHeaderProps) {
  const {
    tenantSlug,
    projectSlug,
    allWorkspaces,
    allProjects,
    isReadOnly,
    activeTab,
    onTabChange,
    onOpenSearch,
    onOpenQuickAdd,
    deviations,
    onOpenReconciliation,
    isRefreshing,
    onRefresh,
    items,
    onSelectItem,
    loading,
    currentUser,
    tenantInfo,
    onArchiveProject,
  } = props;

  const handleTabChange = onTabChange;

  return (
    <header className="h-14 min-h-[56px] max-h-[56px] shrink-0 w-full flex items-center justify-between px-2 sm:px-4 overflow-hidden border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="flex items-center space-x-1 sm:space-x-1.5 md:space-x-2 flex-nowrap whitespace-nowrap min-w-0 shrink overflow-hidden">
        <SunShadeLogo variant="horizontal" size="xs" href="/" className="mr-0.5 sm:mr-1 shrink-0" hideTextOnMobile hideTextBelowLg />
        <span className="text-slate-700 shrink-0 text-xs select-none">/</span>
        {/* Workspace Switcher */}
        <WorkspaceSwitcher
          currentTenantSlug={tenantSlug}
          workspaces={allWorkspaces}
        />
        <span className="text-slate-700 shrink-0 text-xs select-none">/</span>
        {/* Project Switcher */}
        <ProjectSwitcher
          tenantSlug={tenantSlug}
          currentProjectSlug={projectSlug}
          projects={allProjects}
          onArchiveCurrentProject={onArchiveProject}
          isReadOnly={isReadOnly}
        />
      </div>

      {/* View tabs */}
      <div className="hidden md:flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg text-xs overflow-x-auto no-scrollbar shrink-0 my-auto self-center md:mx-2 lg:mx-3" data-testid="top-view-tabs">
        {(['board', 'tree', 'sprint'] as const).map((tab) => {
          const icons = {
            board: <Kanban className="w-3.5 h-3.5" />,
            tree: <GitFork className="w-3.5 h-3.5" />,
            sprint: <Calendar className="w-3.5 h-3.5" />,
          };
          const labels = {
            board: 'Kanban',
            tree: 'Hierarchy Tree',
            sprint: 'Sprint Planning',
          };
          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors shrink-0 ${
                activeTab === tab
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {icons[tab]}
              <span className="hidden xl:inline">{labels[tab]}</span>
            </button>
          );
        })}
        <NavToolsDropdown activeTab={activeTab} onSelectTab={(tab) => handleTabChange(tab)} />
      </div>

      {/* Right header actions */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {/* Global Search Button (FEAT-TRK-SEARCH-POPOVER) */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex items-center space-x-1 sm:space-x-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          title="Search Work Items (Press '/' or Cmd+K)"
          data-testid="header-search-btn"
        >
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="hidden lg:inline whitespace-nowrap">Search...</span>
          <kbd className="hidden 2xl:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-800 rounded border border-slate-700">
            /
          </kbd>
        </button>

        {/* Add Item Quick Button (TASK-TRK-HEADER-ADD-BUTTON) */}
        {!isReadOnly && (
          <button
            type="button"
            onClick={onOpenQuickAdd}
            className="flex items-center space-x-1 sm:space-x-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-sm cursor-pointer whitespace-nowrap shrink-0"
            title="Add Item (Press 'c' or 'n')"
            data-testid="header-add-item-btn"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Add Item</span>
            <kbd className="hidden xl:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono font-medium text-emerald-200 bg-emerald-700/60 rounded border border-emerald-500/40">
              N
            </kbd>
          </button>
        )}

        {/* Schema Deviations Quick Trigger */}
        {!isReadOnly && deviations.length > 0 && (
          <button
            type="button"
            onClick={onOpenReconciliation}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-xs font-semibold transition-colors cursor-pointer shadow-sm animate-in fade-in whitespace-nowrap shrink-0"
            title={`${deviations.length} schema deviations detected. Click to review and reconcile.`}
            data-testid="header-deviations-btn"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden md:inline whitespace-nowrap">{deviations.length} Deviation{deviations.length !== 1 ? 's' : ''}</span>
          </button>
        )}

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors shrink-0"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>

        {/* Notifications Inbox */}
        <NotificationBell
          tenantSlug={tenantSlug}
          onOpenItem={(itemId) => {
            const target = items.find((it) => it.id === itemId);
            if (target) {
              onSelectItem(target);
              return true;
            }
            return false;
          }}
        />

        {/* User Menu / Guest Mode */}
        {loading ? (
          <div className="w-20 h-7 bg-slate-900/60 rounded-lg animate-pulse shrink-0" />
        ) : currentUser === null ? (
          <div className="flex items-center space-x-2 shrink-0">
            <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold shrink-0">
              <Eye className="w-3.5 h-3.5" />
              <span>Read-Only Demo</span>
            </span>
            <Link
              href={`/login?next=/${tenantSlug}/${projectSlug}`}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors shrink-0 whitespace-nowrap"
            >
              Sign In
            </Link>
          </div>
        ) : (
          <div className="flex items-center space-x-2 shrink-0">
            {isReadOnly && (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium shrink-0">
                <Eye className="w-3 h-3 text-slate-400" />
                <span>Viewer</span>
              </span>
            )}
            {tenantInfo && (
              <UserMenu
                tenantName={tenantInfo.name}
                tenantSlug={tenantInfo.slug}
                apiKeyPreview={tenantInfo.api_key_preview ?? undefined}
              />
            )}
          </div>
        )}
      </div>
    </header>
  );
}
