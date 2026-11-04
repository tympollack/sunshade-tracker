'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Braces, Search, X, Check, Clock, Database, Tag, Settings as SettingsIcon } from 'lucide-react';
import type { ProjectSettings } from '@/types/tracker';

export interface TokenItem {
  token: string;
  label: string;
  description?: string;
  category: 'work_item' | 'metadata' | 'settings' | 'timestamp';
}

export const WORK_ITEM_TOKENS: TokenItem[] = [
  { token: '{{item.id}}', label: 'item.id', description: 'Unique Work Item UUID', category: 'work_item' },
  { token: '{{item.title}}', label: 'item.title', description: 'Item title / name', category: 'work_item' },
  { token: '{{item.status}}', label: 'item.status', description: 'Current status ID (e.g. in_review)', category: 'work_item' },
  { token: '{{item.assignee}}', label: 'item.assignee', description: 'Assigned team member handle', category: 'work_item' },
  { token: '{{item.item_type}}', label: 'item.item_type', description: 'Hierarchy level type (e.g. story, task)', category: 'work_item' },
  { token: '{{item.external_ref_id}}', label: 'item.external_ref_id', description: 'External reference ID (e.g. TASK-101)', category: 'work_item' },
  { token: '{{item.order_index}}', label: 'item.order_index', description: 'Ordering position index', category: 'work_item' },
];

export const SYSTEM_TIMESTAMP_TOKENS: TokenItem[] = [
  { token: '{{NOW()}}', label: 'NOW()', description: 'Current ISO 8601 timestamp string', category: 'timestamp' },
  { token: '{{TODAY}}', label: 'TODAY', description: 'Current calendar date in YYYY-MM-DD', category: 'timestamp' },
];

export function extractMetadataTokens(settings?: ProjectSettings | null): TokenItem[] {
  if (!settings) return [];
  const tokens: TokenItem[] = [];
  const seenKeys = new Set<string>();

  (settings.custom_fields || []).forEach((field) => {
    const key = typeof field === 'string' ? field : field?.key;
    if (key && !seenKeys.has(key)) {
      seenKeys.add(key);
      const label = typeof field === 'object' && field?.label ? field.label : key;
      const type = typeof field === 'object' && field?.type ? ` (${field.type})` : '';
      tokens.push({
        token: `{{item.metadata.${key}}}`,
        label: `item.metadata.${key}`,
        description: `Custom field: ${label}${type}`,
        category: 'metadata',
      });
    }
  });

  (settings.custom_metadata_fields || []).forEach((field: any) => {
    const key = typeof field === 'string' ? field : field?.key;
    if (key && !seenKeys.has(key)) {
      seenKeys.add(key);
      const label = field?.label || key;
      const type = field?.type ? ` (${field.type})` : '';
      tokens.push({
        token: `{{item.metadata.${key}}}`,
        label: `item.metadata.${key}`,
        description: `Metadata field: ${label}${type}`,
        category: 'metadata',
      });
    }
  });

  return tokens;
}

export function extractSettingsTokens(settings?: ProjectSettings | null): TokenItem[] {
  if (!settings) return [];
  const tokens: TokenItem[] = [];
  const excludedKeys = new Set([
    'hierarchy',
    'statuses',
    'custom_fields',
    'custom_metadata_fields',
    'transition_guards',
    'automations',
    'templates',
  ]);

  function walk(obj: any, path: string, depth = 0) {
    if (depth > 3 || !obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    for (const [key, value] of Object.entries(obj)) {
      if (depth === 0 && excludedKeys.has(key)) continue;
      const currentPath = `${path}.${key}`;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        walk(value, currentPath, depth + 1);
      } else if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        tokens.push({
          token: `{{${currentPath}}}`,
          label: currentPath,
          description: String(value),
          category: 'settings',
        });
      }
    }
  }

  walk(settings, 'settings', 0);
  return tokens;
}

/**
 * Inserts a token at the current cursor selection in a text input or textarea,
 * dispatching standard input events for React controlled component synchronization.
 */
export function insertTokenAtCursor(
  input: HTMLInputElement | HTMLTextAreaElement,
  token: string
) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const original = input.value;
  const updated = original.slice(0, start) + token + original.slice(end);

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement?.prototype || {},
    'value'
  )?.set;
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement?.prototype || {},
    'value'
  )?.set;

  const setter = input instanceof HTMLTextAreaElement ? nativeTextAreaValueSetter : nativeInputValueSetter;
  if (setter) {
    setter.call(input, updated);
  } else {
    input.value = updated;
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  const newPos = start + token.length;
  input.focus();
  input.setSelectionRange(newPos, newPos);
}

export interface TokenCatalogPopoverProps {
  settings?: ProjectSettings | null;
  onSelectToken?: (token: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  buttonLabel?: string;
  buttonClassName?: string;
  iconOnly?: boolean;
  disabled?: boolean;
  align?: 'left' | 'right';
}

export function TokenCatalogPopover({
  settings,
  onSelectToken,
  inputRef,
  buttonLabel = 'Insert Variable',
  buttonClassName,
  iconOnly = false,
  disabled = false,
  align = 'right',
}: TokenCatalogPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input when popover opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const allTokens = useMemo<TokenItem[]>(() => {
    const metaTokens = extractMetadataTokens(settings);
    const settingsTokens = extractSettingsTokens(settings);
    return [
      ...WORK_ITEM_TOKENS,
      ...metaTokens,
      ...settingsTokens,
      ...SYSTEM_TIMESTAMP_TOKENS,
    ];
  }, [settings]);

  const filteredTokens = useMemo(() => {
    if (!searchQuery.trim()) return allTokens;
    const q = searchQuery.toLowerCase().trim();
    return allTokens.filter(
      (t) =>
        t.token.toLowerCase().includes(q) ||
        t.label.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }, [allTokens, searchQuery]);

  const tokensByCategory = useMemo(() => {
    const groups: Record<TokenItem['category'], TokenItem[]> = {
      work_item: [],
      metadata: [],
      settings: [],
      timestamp: [],
    };
    filteredTokens.forEach((t) => {
      groups[t.category].push(t);
    });
    return groups;
  }, [filteredTokens]);

  const handleInsert = (token: string) => {
    if (inputRef?.current) {
      insertTokenAtCursor(inputRef.current, token);
    }
    if (onSelectToken) {
      onSelectToken(token);
    }
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1200);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-flex items-center" ref={popoverRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Insert Variable"
        aria-haspopup="true"
        aria-expanded={isOpen}
        data-testid="token-catalog-popover-trigger"
        className={
          buttonClassName ||
          `inline-flex items-center space-x-1.5 px-2 py-1 text-xs font-mono rounded-md border border-slate-700 bg-slate-900/90 text-slate-300 hover:text-emerald-400 hover:border-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed`
        }
        title="Insert Variable Token"
      >
        <Braces className="w-3.5 h-3.5 text-emerald-400" />
        {!iconOnly && <span>{buttonLabel}</span>}
      </button>

      {isOpen && (
        <div
          data-testid="token-catalog-popover-menu"
          className={`absolute top-full mt-1.5 ${
            align === 'right' ? 'right-0' : 'left-0'
          } w-80 max-w-[90vw] bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col text-xs text-slate-300 animate-in fade-in-50 zoom-in-95`}
        >
          {/* Header */}
          <div className="p-2.5 border-b border-slate-900 bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Braces className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-slate-200">Schema Variables</span>
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              {filteredTokens.length} tokens
            </span>
          </div>

          {/* Search Bar */}
          <div className="p-2 border-b border-slate-900/80 bg-slate-950">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search fields, metadata, settings..."
                data-testid="token-catalog-search-input"
                className="w-full pl-8 pr-7 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 font-mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 text-slate-500 hover:text-slate-300 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Tokens List grouped by Category */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-900/50 p-1">
            {filteredTokens.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No matching tokens found for &quot;{searchQuery}&quot;
              </div>
            ) : (
              <>
                {/* 1. Work Item Properties */}
                {tokensByCategory.work_item.length > 0 && (
                  <div className="p-1 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-sky-400" />
                      <span>Work Item Properties</span>
                    </div>
                    {tokensByCategory.work_item.map((t) => (
                      <button
                        key={t.token}
                        type="button"
                        onClick={() => handleInsert(t.token)}
                        data-testid={`token-option-${t.label}`}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 transition-colors flex items-center justify-between group"
                      >
                        <div className="truncate mr-2">
                          <span className="font-mono text-emerald-400 text-xs group-hover:text-emerald-300 font-medium">
                            {t.token}
                          </span>
                          {t.description && (
                            <p className="text-[10px] text-slate-500 truncate group-hover:text-slate-400">
                              {t.description}
                            </p>
                          )}
                        </div>
                        {copiedToken === t.token ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <span className="text-[10px] font-mono text-slate-600 group-hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            Insert
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* 2. Dynamic Metadata */}
                {tokensByCategory.metadata.length > 0 && (
                  <div className="p-1 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Database className="w-3 h-3 text-purple-400" />
                      <span>Dynamic Metadata</span>
                    </div>
                    {tokensByCategory.metadata.map((t) => (
                      <button
                        key={t.token}
                        type="button"
                        onClick={() => handleInsert(t.token)}
                        data-testid={`token-option-${t.label}`}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 transition-colors flex items-center justify-between group"
                      >
                        <div className="truncate mr-2">
                          <span className="font-mono text-purple-400 text-xs group-hover:text-purple-300 font-medium">
                            {t.token}
                          </span>
                          {t.description && (
                            <p className="text-[10px] text-slate-500 truncate group-hover:text-slate-400">
                              {t.description}
                            </p>
                          )}
                        </div>
                        {copiedToken === t.token ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <span className="text-[10px] font-mono text-slate-600 group-hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            Insert
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* 3. Project Settings Variables */}
                {tokensByCategory.settings.length > 0 && (
                  <div className="p-1 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <SettingsIcon className="w-3 h-3 text-amber-400" />
                      <span>Project Settings</span>
                    </div>
                    {tokensByCategory.settings.map((t) => (
                      <button
                        key={t.token}
                        type="button"
                        onClick={() => handleInsert(t.token)}
                        data-testid={`token-option-${t.label}`}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 transition-colors flex items-center justify-between group"
                      >
                        <div className="truncate mr-2">
                          <span className="font-mono text-amber-400 text-xs group-hover:text-amber-300 font-medium">
                            {t.token}
                          </span>
                          {t.description && (
                            <p className="text-[10px] text-slate-500 truncate group-hover:text-slate-400">
                              Value: {t.description}
                            </p>
                          )}
                        </div>
                        {copiedToken === t.token ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <span className="text-[10px] font-mono text-slate-600 group-hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            Insert
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* 4. System Timestamps */}
                {tokensByCategory.timestamp.length > 0 && (
                  <div className="p-1 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-emerald-400" />
                      <span>System Timestamps</span>
                    </div>
                    {tokensByCategory.timestamp.map((t) => (
                      <button
                        key={t.token}
                        type="button"
                        onClick={() => handleInsert(t.token)}
                        data-testid={`token-option-${t.label}`}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 transition-colors flex items-center justify-between group"
                      >
                        <div className="truncate mr-2">
                          <span className="font-mono text-emerald-400 text-xs group-hover:text-emerald-300 font-medium">
                            {t.token}
                          </span>
                          {t.description && (
                            <p className="text-[10px] text-slate-500 truncate group-hover:text-slate-400">
                              {t.description}
                            </p>
                          )}
                        </div>
                        {copiedToken === t.token ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <span className="text-[10px] font-mono text-slate-600 group-hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            Insert
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Hint */}
          <div className="p-2 border-t border-slate-900 bg-slate-900/40 text-[10px] text-slate-500 text-center">
            Clicking a token inserts it at cursor position in the field.
          </div>
        </div>
      )}
    </div>
  );
}
