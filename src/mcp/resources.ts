import { ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';

export const TRACKER_RESOURCE_TEMPLATES: ResourceTemplate[] = [
  {
    uriTemplate: 'tracker://projects/{slug}/schema',
    name: 'Project Schema & Hierarchy',
    description: 'Exposes hierarchy constraints, allowed parent types, and field schemas for a project.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'tracker://projects/{slug}/context',
    name: 'Project Execution Context Brief',
    description: 'Aggregates active sprint epics, in-flight PRs, and top-priority blockers into a condensed markdown brief.',
    mimeType: 'text/markdown',
  },
];
