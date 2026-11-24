import {
  CustomFieldType,
  ProjectSettings,
  RowColumnConfig,
  RowColumnSource,
  RowColumnViewTarget,
  RowColumnWidth,
  WorkItem,
  getWorkMetricConfig,
  normalizeCustomField,
} from '@/types/tracker';

export type RowColumnPlacement = 'left' | 'right';

export interface ResolvedRowColumn {
  key: string;
  label: string;
  source: RowColumnSource;
  width: RowColumnWidth;
  placement: RowColumnPlacement;
  fieldType?: CustomFieldType;
  unit?: string;
  options?: string[];
}

export interface FormattedRowCellValue {
  displayText: string;
  rawText: string;
  empty: boolean;
  badgeVariant?: 'danger' | 'warning' | 'info' | 'success' | 'neutral';
}

export const DEFAULT_TREE_COLUMN_KEYS: readonly string[] = [
  'ref_id',
  'points',
  'assignee',
  'status',
];

export const DEFAULT_TABLE_COLUMN_KEYS: readonly string[] = [
  'ref_id',
  'points',
  'assignee',
  'status',
  'sprint',
  'github',
];

export const STATIC_COLUMN_KEYS = new Set<string>([
  'ref_id',
  'points',
  'assignee',
  'status',
  'sprint',
  'github',
  'project',
  'updated_at',
  'created_at',
]);

// Metadata keys already represented by static columns or too verbose for default table discovery
const EXCLUDED_DYNAMIC_DISCOVERY_KEYS = new Set<string>([
  'status',
  'assignee',
  'parent_id',
  'project_id',
  'sprint',
  'sprint_id',
  'story_points',
  'points',
  'estimate',
  'pr_url',
  'commit_hash',
  'github_pr',
  'github_commit',
  'pr_number',
  'agent_prompt',
  'created_at',
  'updated_at',
  'completed_at',
  'closed_at',
  'deleted_at',
]);

export function formatColumnLabel(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function inferColumnType(key: string): CustomFieldType {
  const norm = key.toLowerCase();
  if (
    norm.endsWith('_date') ||
    norm.startsWith('date_') ||
    norm === 'date' ||
    norm === 'due_date' ||
    norm === 'target_date'
  ) {
    return 'date';
  }
  if (norm.startsWith('is_') || norm.startsWith('has_') || norm.startsWith('should_')) {
    return 'boolean';
  }
  if (
    norm === 'priority' ||
    norm === 'severity' ||
    norm === 'risk' ||
    norm === 'source_type'
  ) {
    return 'enum';
  }
  if (
    norm === 'complexity' ||
    norm.includes('hours') ||
    norm.includes('cost') ||
    norm.includes('budget') ||
    norm.includes('credits') ||
    norm.includes('score') ||
    norm.includes('amount')
  ) {
    return 'number';
  }
  return 'string';
}

export function getColumnTrackWidthClass(width: RowColumnWidth = 'sm', key?: string): string {
  if (key === 'points') return 'w-28';
  if (key === 'assignee' || key === 'status') return 'w-9';
  if (key === 'github') return 'w-36';
  switch (width) {
    case 'xs':
      return 'w-16';
    case 'sm':
      return 'w-24';
    case 'md':
      return 'w-28';
    case 'lg':
      return 'w-36';
    default:
      return 'w-24';
  }
}

export function getResponsiveMdTrackWidthClass(width: RowColumnWidth = 'sm', key?: string): string {
  if (key === 'points') return 'md:w-28';
  if (key === 'assignee' || key === 'status') return 'md:w-9';
  if (key === 'github') return 'md:w-36';
  switch (width) {
    case 'xs':
      return 'md:w-16';
    case 'sm':
      return 'md:w-24';
    case 'md':
      return 'md:w-28';
    case 'lg':
      return 'md:w-36';
    default:
      return 'md:w-24';
  }
}

export function getStaticRowColumns(projectSettings?: ProjectSettings | null): ResolvedRowColumn[] {
  const workMetric = getWorkMetricConfig(projectSettings);
  return [
    { key: 'ref_id', label: 'Ref ID', source: 'static', width: 'md', placement: 'left' },
    {
      key: 'points',
      label: workMetric.label || 'Points',
      source: 'static',
      width: 'sm',
      placement: 'right',
    },
    { key: 'assignee', label: 'Assignee', source: 'static', width: 'xs', placement: 'right' },
    { key: 'status', label: 'Status', source: 'static', width: 'xs', placement: 'right' },
    { key: 'sprint', label: 'Sprint', source: 'static', width: 'md', placement: 'right' },
    { key: 'github', label: 'GitHub', source: 'static', width: 'md', placement: 'right' },
    { key: 'project', label: 'Project', source: 'static', width: 'sm', placement: 'right' },
    { key: 'updated_at', label: 'Updated', source: 'static', width: 'sm', placement: 'right' },
    { key: 'created_at', label: 'Created', source: 'static', width: 'sm', placement: 'right' },
  ];
}

export function resolveAvailableRowColumns(
  projectSettings?: ProjectSettings | null,
  items?: WorkItem[]
): ResolvedRowColumn[] {
  const staticCols = getStaticRowColumns(projectSettings);
  const byKey = new Map<string, ResolvedRowColumn>();
  for (const col of staticCols) {
    byKey.set(col.key, col);
  }

  const metricKey = getWorkMetricConfig(projectSettings).field_key?.toLowerCase();

  const registerDynamic = (
    key: string,
    opts?: {
      label?: string;
      type?: CustomFieldType;
      unit?: string;
      options?: string[];
      width?: RowColumnWidth;
    }
  ) => {
    const trimmed = (key || '').trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (byKey.has(trimmed) || byKey.has(lower)) return;
    const fieldType = opts?.type || inferColumnType(trimmed);
    const defaultWidth: RowColumnWidth =
      fieldType === 'number' || fieldType === 'boolean' ? 'xs' : 'sm';
    byKey.set(trimmed, {
      key: trimmed,
      label: opts?.label || formatColumnLabel(trimmed),
      source: 'dynamic',
      width: opts?.width || defaultWidth,
      placement: 'right',
      fieldType,
      unit: opts?.unit,
      options: opts?.options,
    });
  };

  // 1. Schema custom_metadata_fields (rich typed definitions)
  (projectSettings?.custom_metadata_fields || []).forEach((cmf) => {
    if (!cmf?.key) return;
    const lower = cmf.key.toLowerCase();
    if (EXCLUDED_DYNAMIC_DISCOVERY_KEYS.has(lower) || lower === metricKey) return;
    registerDynamic(cmf.key, {
      label: cmf.label,
      type: cmf.type,
      unit: cmf.unit,
      options: cmf.options,
    });
  });

  // 2. Schema custom_fields (flat strings or typed definitions)
  (projectSettings?.custom_fields || []).forEach((cf) => {
    const def = normalizeCustomField(cf);
    if (!def.key) return;
    const lower = def.key.toLowerCase();
    if (EXCLUDED_DYNAMIC_DISCOVERY_KEYS.has(lower) || lower === metricKey) return;
    registerDynamic(def.key, {
      label: def.label,
      type: def.type !== 'string' ? def.type : inferColumnType(def.key),
      unit: def.unit,
      options: def.options,
    });
  });

  // 3. Explicit columns referenced in projectSettings.row_columns
  (Array.isArray(projectSettings?.row_columns) ? projectSettings.row_columns : []).forEach((rc) => {
    if (!rc || typeof rc !== 'object' || typeof rc.key !== 'string' || !rc.key.trim()) return;
    const safeLabel =
      typeof rc.label === 'string' && rc.label.trim() ? rc.label : undefined;
    const safeWidth: RowColumnWidth | undefined =
      rc.width === 'xs' || rc.width === 'sm' || rc.width === 'md' || rc.width === 'lg'
        ? rc.width
        : undefined;
    const safeSource: RowColumnSource | undefined =
      rc.source === 'static' || rc.source === 'dynamic' ? rc.source : undefined;
    const existing = byKey.get(rc.key);
    if (existing) {
      byKey.set(rc.key, {
        ...existing,
        label: safeLabel || existing.label,
        width: safeWidth || existing.width,
        source: safeSource || existing.source,
      });
    } else {
      registerDynamic(rc.key, {
        label: safeLabel,
        width: safeWidth,
      });
    }
  });

  // 4. Item metadata keys observed in workspace items (excluding internal/excluded keys)
  (items || []).forEach((item) => {
    if (!item?.metadata || typeof item.metadata !== 'object') return;
    Object.keys(item.metadata).forEach((k) => {
      const lower = k.toLowerCase();
      if (EXCLUDED_DYNAMIC_DISCOVERY_KEYS.has(lower) || lower === metricKey) return;
      if (lower.startsWith('_')) return;
      registerDynamic(k);
    });
  });

  return Array.from(byKey.values());
}

export function getDefaultRowColumnKeys(
  projectSettings: ProjectSettings | null | undefined,
  view: RowColumnViewTarget
): string[] {
  const configured = projectSettings?.row_columns;
  if (Array.isArray(configured)) {
    return configured
      .filter((col) => {
        if (!col || typeof col !== 'object' || typeof col.key !== 'string' || !col.key.trim()) {
          return false;
        }
        if (col.visible === false) return false;
        if (Array.isArray(col.views) && !col.views.includes(view)) {
          return false;
        }
        return true;
      })
      .map((col) => col.key);
  }
  return [...(view === 'tree' ? DEFAULT_TREE_COLUMN_KEYS : DEFAULT_TABLE_COLUMN_KEYS)];
}

export function resolveEffectiveRowColumns(
  projectSettings: ProjectSettings | null | undefined,
  view: RowColumnViewTarget,
  userSelectedKeys?: string[] | null,
  items?: WorkItem[]
): ResolvedRowColumn[] {
  const available = resolveAvailableRowColumns(projectSettings, items);
  const byKey = new Map(available.map((col) => [col.key, col]));
  const keys =
    userSelectedKeys && Array.isArray(userSelectedKeys)
      ? userSelectedKeys
      : getDefaultRowColumnKeys(projectSettings, view);

  const resolved: ResolvedRowColumn[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const existing = byKey.get(key);
    if (existing) {
      resolved.push(existing);
    } else {
      resolved.push({
        key,
        label: formatColumnLabel(key),
        source: STATIC_COLUMN_KEYS.has(key) ? 'static' : 'dynamic',
        width: 'sm',
        placement: key === 'ref_id' ? 'left' : 'right',
        fieldType: inferColumnType(key),
      });
    }
  }
  return resolved;
}

function formatShortDate(raw: string): string {
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function resolvePriorityVariant(val: string): FormattedRowCellValue['badgeVariant'] {
  const norm = val.toLowerCase().trim();
  if (norm === 'p0' || norm === 'critical' || norm === 'emergency' || norm === 'high') {
    return 'danger';
  }
  if (norm === 'p1' || norm === 'medium' || norm === 'med') {
    return 'warning';
  }
  if (norm === 'p2' || norm === 'normal') {
    return 'info';
  }
  if (norm === 'low' || norm === 'p3' || norm === 'p4') {
    return 'neutral';
  }
  return 'neutral';
}

export function formatRowCellValue(
  item: WorkItem,
  col: ResolvedRowColumn,
  context?: {
    allProjects?: Array<{ id: string; slug?: string; name: string }>;
  }
): FormattedRowCellValue {
  if (col.key === 'sprint') {
    const sprintName = item.metadata?.sprint;
    if (!sprintName || String(sprintName).trim() === '' || String(sprintName).toLowerCase() === 'unplanned') {
      return { displayText: 'Backlog', rawText: 'Backlog (Unassigned)', empty: false, badgeVariant: 'neutral' };
    }
    return {
      displayText: String(sprintName),
      rawText: String(sprintName),
      empty: false,
      badgeVariant: 'success',
    };
  }

  if (col.key === 'project') {
    const proj = context?.allProjects?.find(
      (p) => p.id === item.project_id || p.slug === item.project_id
    );
    const name = proj?.name || item.project_id || '';
    if (!name) return { displayText: '—', rawText: '', empty: true };
    return { displayText: name, rawText: name, empty: false, badgeVariant: 'info' };
  }

  if (col.key === 'updated_at' || col.key === 'created_at') {
    const raw = col.key === 'updated_at' ? item.updated_at : item.created_at;
    if (!raw) return { displayText: '—', rawText: '', empty: true };
    return { displayText: formatShortDate(raw), rawText: raw, empty: false };
  }

  const rawValue = item.metadata?.[col.key];
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { displayText: '—', rawText: '', empty: true };
  }

  if (col.fieldType === 'boolean' || typeof rawValue === 'boolean') {
    const truthy =
      typeof rawValue === 'boolean'
        ? rawValue
        : ['true', '1', 'yes'].includes(String(rawValue).toLowerCase().trim());
    return {
      displayText: truthy ? 'Yes' : 'No',
      rawText: truthy ? 'Yes' : 'No',
      empty: false,
      badgeVariant: truthy ? 'success' : 'neutral',
    };
  }

  if (col.fieldType === 'date') {
    const rawStr = String(rawValue);
    return {
      displayText: formatShortDate(rawStr),
      rawText: rawStr,
      empty: false,
    };
  }

  if (col.fieldType === 'number' && !isNaN(Number(rawValue))) {
    const text = col.unit ? `${rawValue} ${col.unit}` : String(rawValue);
    return { displayText: text, rawText: text, empty: false };
  }

  const text =
    typeof rawValue === 'object' ? JSON.stringify(rawValue) : String(rawValue);

  if (
    col.key.toLowerCase() === 'priority' ||
    col.key.toLowerCase() === 'severity' ||
    col.key.toLowerCase() === 'risk'
  ) {
    return {
      displayText: text,
      rawText: text,
      empty: false,
      badgeVariant: resolvePriorityVariant(text),
    };
  }

  return {
    displayText: text,
    rawText: text,
    empty: false,
    badgeVariant: col.fieldType === 'enum' ? 'info' : undefined,
  };
}
