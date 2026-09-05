import { ProjectSettings } from '@/types/tracker';

/**
 * Starter hierarchy templates for the onboarding wizard.
 * Each template provides a sensible default schema for a common use case.
 */

export interface SchemaTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  settings: ProjectSettings;
}

const COMMON_STATUSES = [
  { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
  { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
  { id: 'in_review', label: 'In Review', color: '#f59e0b', order: 3 },
  { id: 'complete', label: 'Complete', color: '#22c55e', order: 4 },
  { id: 'blocked', label: 'Blocked', color: '#ef4444', order: 5 },
];

export const SCHEMA_TEMPLATES: SchemaTemplate[] = [
  {
    id: 'software',
    name: 'Software Development',
    description: 'Epic → Story → Task → Subtask hierarchy for agile teams',
    icon: '💻',
    settings: {
      schema_version: '1.0',
      hierarchy: [
        { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
        { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'] },
        { type: 'task', label: 'Task', level: 3, allowed_parents: ['story', 'epic'] },
        { type: 'subtask', label: 'Subtask', level: 4, allowed_parents: ['task'] },
      ],
      statuses: COMMON_STATUSES,
      custom_fields: ['priority', 'complexity', 'story_points', 'commit_hash', 'pr_url'],
    },
  },
  {
    id: 'marketing',
    name: 'Marketing',
    description: 'Campaign → Initiative → Deliverable for marketing ops',
    icon: '📣',
    settings: {
      schema_version: '1.0',
      hierarchy: [
        { type: 'campaign', label: 'Campaign', level: 1, allowed_parents: [] },
        { type: 'initiative', label: 'Initiative', level: 2, allowed_parents: ['campaign'] },
        { type: 'deliverable', label: 'Deliverable', level: 3, allowed_parents: ['initiative'] },
      ],
      statuses: [
        { id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 },
        { id: 'drafting', label: 'Drafting', color: '#a855f7', order: 2 },
        { id: 'in_review', label: 'In Review', color: '#f59e0b', order: 3 },
        { id: 'approved', label: 'Approved', color: '#22c55e', order: 4 },
        { id: 'published', label: 'Published', color: '#10b981', order: 5 },
      ],
      custom_fields: ['channel', 'owner', 'due_date', 'budget', 'kpi'],
    },
  },
  {
    id: 'operations',
    name: 'Operations',
    description: 'Workstream → Process → Action for operational teams',
    icon: '⚙️',
    settings: {
      schema_version: '1.0',
      hierarchy: [
        { type: 'workstream', label: 'Workstream', level: 1, allowed_parents: [] },
        { type: 'process', label: 'Process', level: 2, allowed_parents: ['workstream'] },
        { type: 'action', label: 'Action Item', level: 3, allowed_parents: ['process'] },
      ],
      statuses: [
        { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
        { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
        { id: 'pending', label: 'Pending', color: '#f59e0b', order: 3 },
        { id: 'done', label: 'Done', color: '#22c55e', order: 4 },
      ],
      custom_fields: ['owner', 'department', 'due_date', 'impact', 'sop_link'],
    },
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Start from a minimal 2-level hierarchy and customize everything',
    icon: '🎨',
    settings: {
      schema_version: '1.0',
      hierarchy: [
        { type: 'group', label: 'Group', level: 1, allowed_parents: [] },
        { type: 'item', label: 'Item', level: 2, allowed_parents: ['group'] },
      ],
      statuses: [
        { id: 'todo', label: 'To Do', color: '#94a3b8', order: 1 },
        { id: 'doing', label: 'Doing', color: '#38bdf8', order: 2 },
        { id: 'done', label: 'Done', color: '#22c55e', order: 3 },
      ],
      custom_fields: [],
    },
  },
];

export function getTemplateById(id: string): SchemaTemplate | undefined {
  return SCHEMA_TEMPLATES.find((t) => t.id === id);
}
