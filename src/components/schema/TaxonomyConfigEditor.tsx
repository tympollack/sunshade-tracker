'use client';

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { X, Plus, AlertTriangle, Layers, Clock, CheckCircle2, CircleDashed, Tag } from 'lucide-react';
import { ProjectSettings, StatusDefinition, WorkItem } from '@/types/tracker';
import { DEFAULT_METRIC_RULES } from '@/lib/services/sprintAnalyticsService';

export interface TaxonomyConfigEditorProps {
  settings: ProjectSettings;
  onChange: (updatedSettings: ProjectSettings) => void;
  activeItems?: WorkItem[];
  readOnly?: boolean;
}

const DEFAULT_STORY_TYPE_SUGGESTIONS = [
  'epic',
  'story',
  'task',
  'bug',
  'chore',
  'initiative',
  'feature',
  'spike',
  'debt',
  'documentation',
];

const DEFAULT_LATE_TYPE_SUGGESTIONS = [
  'bug',
  'chore',
  'debt',
  'documentation',
  'doc',
  'test',
  'hotfix',
  'incident',
  'task',
];

const CANONICAL_UNSTARTED_SUGGESTIONS = [
  'not_started',
  'todo',
  'unplanned',
  'backlog',
  'open',
  'planned',
  'pitch_backlog',
];

const CANONICAL_IN_PROGRESS_SUGGESTIONS = [
  'in_progress',
  'doing',
  'active',
  'review',
  'in_review',
  'qa',
  'testing',
  'blocked',
];

const CANONICAL_COMPLETED_SUGGESTIONS = [
  'done',
  'completed',
  'resolved',
  'closed',
  'shipped',
  'released',
];

// Reusable Tag / Chip Input with autocomplete and keyboard control
interface TagInputProps {
  id?: string;
  label: string;
  description: string;
  tags: string[];
  onChange: (newTags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  readOnly?: boolean;
  colorScheme?: 'cyan' | 'amber' | 'emerald' | 'sky';
  onAttemptRemove?: (tag: string) => boolean; // return false to block removal
}

function TagInput({
  id,
  label,
  description,
  tags,
  onChange,
  suggestions = [],
  placeholder = '+ Add type...',
  readOnly = false,
  colorScheme = 'cyan',
  onAttemptRemove,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions not already present
  const availableSuggestions = suggestions.filter((s) => {
    const norm = s.toLowerCase().trim();
    return norm && !tags.includes(norm) && norm.includes(inputValue.toLowerCase().trim());
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addTag = (val: string) => {
    const cleaned = val.toLowerCase().trim().replace(/^,|,$/g, '');
    if (!cleaned) return;
    if (tags.includes(cleaned)) {
      setInputValue('');
      setIsOpen(false);
      return;
    }
    onChange([...tags, cleaned]);
    setInputValue('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const removeTag = (tagToRemove: string) => {
    if (readOnly) return;
    if (onAttemptRemove && onAttemptRemove(tagToRemove) === false) {
      return;
    }
    onChange(tags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (readOnly) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen && availableSuggestions.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else if (availableSuggestions.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % availableSuggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (availableSuggestions.length > 0) {
        setHighlightedIndex((prev) => (prev - 1 + availableSuggestions.length) % availableSuggestions.length);
      }
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && availableSuggestions[highlightedIndex]) {
        addTag(availableSuggestions[highlightedIndex]);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      e.preventDefault();
      const lastTag = tags[tags.length - 1];
      removeTag(lastTag);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const badgeStyles = {
    cyan: 'bg-cyan-950/40 text-cyan-200 border-cyan-800/80 hover:border-cyan-600',
    amber: 'bg-amber-950/40 text-amber-200 border-amber-800/80 hover:border-amber-600',
    emerald: 'bg-emerald-950/40 text-emerald-200 border-emerald-800/80 hover:border-emerald-600',
    sky: 'bg-sky-950/40 text-sky-200 border-sky-800/80 hover:border-sky-600',
  }[colorScheme];

  return (
    <div className="space-y-2" ref={containerRef}>
      <div>
        <label htmlFor={id} className="text-xs font-semibold text-slate-200 block">
          {label}
        </label>
        <p className="text-[11px] text-slate-400">{description}</p>
      </div>

      <div
        onClick={() => inputRef.current?.focus()}
        className="min-h-[42px] p-1.5 rounded-lg bg-slate-950 border border-slate-800 focus-within:border-slate-700 flex flex-wrap items-center gap-1.5 cursor-text transition-colors"
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-mono font-medium border shadow-sm transition-all ${badgeStyles}`}
          >
            <span>{tag}</span>
            {!readOnly && (
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="hover:bg-white/10 rounded-full p-0.5 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {!readOnly && (
          <div className="relative inline-flex items-center min-w-[120px] flex-1">
            <input
              id={id}
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setIsOpen(true);
                setHighlightedIndex(-1);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={tags.length === 0 ? placeholder : '+ add...'}
              className="w-full bg-transparent text-xs text-white placeholder-slate-600 font-mono focus:outline-none px-1 py-1"
            />

            {/* Autocomplete Dropdown */}
            {isOpen && availableSuggestions.length > 0 && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-56 max-h-48 overflow-y-auto rounded-lg bg-slate-900 border border-slate-700 shadow-xl py-1 text-xs font-mono">
                <div className="px-2 py-1 text-[10px] text-slate-500 uppercase font-sans font-semibold border-b border-slate-800">
                  Suggestions ({availableSuggestions.length})
                </div>
                {availableSuggestions.map((item, idx) => (
                  <button
                    key={item}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addTag(item);
                    }}
                    className={`w-full text-left px-3 py-1.5 transition-colors flex items-center justify-between ${
                      idx === highlightedIndex
                        ? 'bg-slate-800 text-cyan-300 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span>{item}</span>
                    <Plus className="w-3 h-3 text-slate-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function TaxonomyConfigEditor({
  settings,
  onChange,
  activeItems = [],
  readOnly = false,
}: TaxonomyConfigEditorProps) {
  const [statusWarning, setStatusWarning] = useState<string | null>(null);

  // Compute status counts for items currently on the board
  const activeStatusUsage = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of activeItems) {
      if (item.status) {
        const norm = item.status.toLowerCase().trim();
        counts.set(norm, (counts.get(norm) || 0) + 1);
      }
    }
    return counts;
  }, [activeItems]);

  // Project hierarchy types and item types from existing items
  const knownStoryTypes = React.useMemo(() => {
    const set = new Set<string>(DEFAULT_STORY_TYPE_SUGGESTIONS);
    (settings.hierarchy || []).forEach((h) => set.add(h.type.toLowerCase().trim()));
    activeItems.forEach((it) => it.item_type && set.add(it.item_type.toLowerCase().trim()));
    return Array.from(set);
  }, [settings.hierarchy, activeItems]);

  // Project status IDs
  const knownStatusIds = React.useMemo(() => {
    const set = new Set<string>();
    (settings.statuses || []).forEach((s) => set.add(s.id.toLowerCase().trim()));
    activeItems.forEach((it) => it.status && set.add(it.status.toLowerCase().trim()));
    return Array.from(set);
  }, [settings.statuses, activeItems]);

  // 1. Allowed Story Types
  const allowedStoryTypes =
    settings.allowed_story_types ||
    settings.sprint_metrics?.feature_story_types ||
    DEFAULT_METRIC_RULES.feature_story_types;

  const handleUpdateStoryTypes = (newTypes: string[]) => {
    const updated = {
      ...settings,
      allowed_story_types: newTypes,
      sprint_metrics: {
        ...(settings.sprint_metrics || {}),
        feature_story_types: newTypes,
      },
    };
    onChange(updated);
  };

  // 2. Allowed Late Types (mid-sprint inflow)
  const allowedLateTypes =
    settings.allowed_late_types ||
    settings.sprint_metrics?.allowed_late_types ||
    DEFAULT_METRIC_RULES.allowed_late_types;

  const handleUpdateLateTypes = (newTypes: string[]) => {
    const updated = {
      ...settings,
      allowed_late_types: newTypes,
      sprint_metrics: {
        ...(settings.sprint_metrics || {}),
        allowed_late_types: newTypes,
      },
    };
    onChange(updated);
  };

  // 3. Status Categorization buckets
  const unstartedStatuses =
    settings.unstarted_statuses ||
    settings.sprint_metrics?.unstarted_statuses ||
    DEFAULT_METRIC_RULES.unstarted_statuses;

  const inProgressStatuses =
    settings.in_progress_statuses ||
    settings.sprint_metrics?.in_progress_statuses || [
      'in_progress',
      'doing',
      'review',
      'in_review',
      'qa',
    ];

  const completedStatuses =
    settings.completed_statuses ||
    settings.sprint_metrics?.completed_statuses || [
      'done',
      'completed',
      'resolved',
      'closed',
    ];

  const handleUpdateUnstarted = (newStatuses: string[]) => {
    const updated = {
      ...settings,
      unstarted_statuses: newStatuses,
      sprint_metrics: {
        ...(settings.sprint_metrics || {}),
        unstarted_statuses: newStatuses,
      },
    };
    onChange(updated);
  };

  const handleUpdateInProgress = (newStatuses: string[]) => {
    const updated = {
      ...settings,
      in_progress_statuses: newStatuses,
      sprint_metrics: {
        ...(settings.sprint_metrics || {}),
        in_progress_statuses: newStatuses,
      },
    };
    onChange(updated);
  };

  const handleUpdateCompleted = (newStatuses: string[]) => {
    const updated = {
      ...settings,
      completed_statuses: newStatuses,
      sprint_metrics: {
        ...(settings.sprint_metrics || {}),
        completed_statuses: newStatuses,
      },
    };
    onChange(updated);
  };

  const checkStatusRemoval = (status: string) => {
    const count = activeStatusUsage.get(status.toLowerCase().trim()) || 0;
    if (count > 0) {
      setStatusWarning(
        `Warning: Status "${status}" is currently assigned to ${count} active work item${
          count !== 1 ? 's' : ''
        } on the board.`
      );
      setTimeout(() => setStatusWarning(null), 6000);
    }
    return true; // allow removal but warn
  };

  return (
    <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-900 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Tag className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
              Taxonomy &amp; Lifecycle Configuration
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-cyan-400 border border-cyan-900/40">
                item_types &bull; statuses
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              Configure allowed work item types and map status lifecycle buckets for sprint analytics.
            </p>
          </div>
        </div>
      </div>

      {statusWarning && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center space-x-2 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{statusWarning}</span>
        </div>
      )}

      {/* Item Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TagInput
          id="allowed-story-types"
          label="Allowed Item Types (Creation)"
          description="Types permissible during work item creation (e.g. epic, story, task, bug)."
          tags={allowedStoryTypes}
          onChange={handleUpdateStoryTypes}
          suggestions={knownStoryTypes}
          readOnly={readOnly}
          colorScheme="cyan"
          placeholder="+ Add item type..."
        />

        <TagInput
          id="allowed-late-types"
          label="Allowed Mid-Sprint Inflow Types (allowed_late_types)"
          description="Types permitted to bypass zero-sum backlog swaps when added after sprint activation."
          tags={allowedLateTypes}
          onChange={handleUpdateLateTypes}
          suggestions={Array.from(new Set([...DEFAULT_LATE_TYPE_SUGGESTIONS, ...knownStoryTypes]))}
          readOnly={readOnly}
          colorScheme="amber"
          placeholder="+ Add inflow type..."
        />
      </div>

      {/* Status Categorization Lifecycle Buckets */}
      <div className="space-y-4 pt-2 border-t border-slate-900">
        <div>
          <h5 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Status Categorization (Lifecycle Buckets)</span>
          </h5>
          <p className="text-[11px] text-slate-500">
            Map project status columns into discrete lifecycle stages for burndown, commitment reliability, and zero-sum ejection.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TagInput
            id="unstarted-statuses"
            label="Unstarted / Backlog Statuses"
            description="Eligible for zero-sum backlog ejection when new scope is added mid-sprint."
            tags={unstartedStatuses}
            onChange={handleUpdateUnstarted}
            suggestions={Array.from(new Set([...CANONICAL_UNSTARTED_SUGGESTIONS, ...knownStatusIds]))}
            readOnly={readOnly}
            colorScheme="sky"
            placeholder="+ Add unstarted status..."
            onAttemptRemove={checkStatusRemoval}
          />

          <TagInput
            id="in-progress-statuses"
            label="In Progress / Active Statuses"
            description="Statuses tracked as active WIP during sprint execution."
            tags={inProgressStatuses}
            onChange={handleUpdateInProgress}
            suggestions={Array.from(new Set([...CANONICAL_IN_PROGRESS_SUGGESTIONS, ...knownStatusIds]))}
            readOnly={readOnly}
            colorScheme="amber"
            placeholder="+ Add in-progress status..."
            onAttemptRemove={checkStatusRemoval}
          />

          <TagInput
            id="completed-statuses"
            label="Completed / Closed Statuses"
            description="Statuses that count toward delivered points and Say/Do commitment velocity."
            tags={completedStatuses}
            onChange={handleUpdateCompleted}
            suggestions={Array.from(new Set([...CANONICAL_COMPLETED_SUGGESTIONS, ...knownStatusIds]))}
            readOnly={readOnly}
            colorScheme="emerald"
            placeholder="+ Add completed status..."
            onAttemptRemove={checkStatusRemoval}
          />
        </div>
      </div>
    </div>
  );
}
