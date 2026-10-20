import { WorkItem } from '@/types/tracker';

export interface HierarchyContextItem {
  id: string;
  external_ref_id?: string | null;
  title: string;
  item_type: string;
  status: string;
  description?: string | null;
  metadata?: Record<string, any> | null;
  parent_id?: string | null;
}

export interface TaskContextSpec {
  item: HierarchyContextItem;
  project: {
    id?: string;
    slug?: string;
    name?: string;
    settings?: any;
  };
  hierarchy: HierarchyContextItem[];
  agent_prompt: string;
  acceptance_criteria: string[];
  technical_constraints: string[];
  commit_hashes: string[];
  pr_urls: string[];
  markdown_prompt: string;
}

/**
 * Extracts bullet points or list entries from text under a specific markdown header
 */
function extractSectionList(text: string, headerPatterns: RegExp[]): string[] {
  const results: string[] = [];
  if (!text) return results;

  const lines = text.split('\n');
  let capturing = false;

  for (const line of lines) {
    if (line.startsWith('#')) {
      if (headerPatterns.some((pattern) => pattern.test(line))) {
        capturing = true;
        continue;
      } else if (capturing) {
        break; // Reached next header
      }
    }

    if (capturing) {
      const trimmed = line.trim();
      const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/);
      if (bulletMatch) {
        results.push(bulletMatch[1].trim());
      } else if (trimmed.length > 0 && !trimmed.startsWith('#')) {
        results.push(trimmed);
      }
    }
  }

  return results;
}

/**
 * Generates dynamic agent context and execution prompt from a work item,
 * its parent hierarchy lineage, and project settings.
 */
export function generateAgentPrompt(
  item: HierarchyContextItem | WorkItem,
  context: {
    project?: { id?: string; slug?: string; name?: string; settings?: any };
    hierarchy?: HierarchyContextItem[];
  } = {}
): TaskContextSpec {
  const metadata = (item.metadata || {}) as Record<string, any>;
  const hierarchy = context.hierarchy || [];
  const project = context.project || {};

  // Extract raw agent_prompt or synthesize from description
  const rawAgentPrompt: string =
    typeof metadata.agent_prompt === 'string' && metadata.agent_prompt.trim().length > 0
      ? metadata.agent_prompt.trim()
      : '';

  // Extract acceptance criteria from metadata or prompt
  const acceptanceCriteria: string[] = Array.isArray(metadata.acceptance_criteria)
    ? metadata.acceptance_criteria
    : extractSectionList(rawAgentPrompt || item.description || '', [
        /acceptance criteria/i,
        /definition of done/i,
        /verification/i,
      ]);

  // Extract technical constraints
  const technicalConstraints: string[] = Array.isArray(metadata.technical_constraints)
    ? metadata.technical_constraints
    : extractSectionList(rawAgentPrompt || item.description || '', [
        /constraints/i,
        /requirements/i,
        /context & scope/i,
      ]);

  // Extract commit hashes and PR URLs
  const commitHashes: string[] = [];
  if (metadata.commit_hash && typeof metadata.commit_hash === 'string') {
    commitHashes.push(metadata.commit_hash);
  }
  if (Array.isArray(metadata.commit_hashes)) {
    commitHashes.push(...metadata.commit_hashes.filter((h: any) => typeof h === 'string'));
  }

  const prUrls: string[] = [];
  if (metadata.pr_url && typeof metadata.pr_url === 'string') {
    prUrls.push(metadata.pr_url);
  }
  if (Array.isArray(metadata.pr_urls)) {
    prUrls.push(...metadata.pr_urls.filter((u: any) => typeof u === 'string'));
  }

  // Build the markdown prompt representation
  const sections: string[] = [];

  const refId = item.external_ref_id ? ` [${item.external_ref_id}]` : '';
  sections.push(`# Work Item Context: ${item.title}${refId}`);

  // Project and hierarchy breadcrumbs
  if (project.name || project.slug || hierarchy.length > 0) {
    sections.push('## Project & Hierarchy Lineage');
    if (project.name || project.slug) {
      sections.push(`- **Project:** ${project.name || project.slug} (${project.slug || 'default'})`);
    }
    if (hierarchy.length > 0) {
      const breadcrumbs = hierarchy
        .map((ancestor) => `${ancestor.item_type.toUpperCase()}: ${ancestor.title}${ancestor.external_ref_id ? ` (${ancestor.external_ref_id})` : ''}`)
        .join(' ➔ ');
      sections.push(`- **Lineage:** ${breadcrumbs} ➔ **${item.title}**`);
    }
  }

  // Item details
  sections.push('## Work Item Details');
  sections.push(`- **Item Type:** ${item.item_type}`);
  sections.push(`- **Status:** ${item.status}`);
  if (metadata.sprint) sections.push(`- **Sprint:** ${metadata.sprint}`);
  if (metadata.priority) sections.push(`- **Priority:** ${metadata.priority}`);
  if (metadata.story_points !== undefined) sections.push(`- **Story Points:** ${metadata.story_points}`);

  if (item.description) {
    sections.push('## Description');
    sections.push(item.description);
  }

  // Pre-configured agent prompt or synthesized execution guide
  if (rawAgentPrompt) {
    sections.push('## Agent Execution Instructions');
    sections.push(rawAgentPrompt);
  } else {
    sections.push('## Agent Execution Instructions');
    sections.push(`### OBJECTIVE\nImplement or resolve work item "${item.title}".`);
    if (acceptanceCriteria.length > 0) {
      sections.push('### ACCEPTANCE CRITERIA\n' + acceptanceCriteria.map((c) => `- ${c}`).join('\n'));
    }
  }

  if (commitHashes.length > 0 || prUrls.length > 0) {
    sections.push('## Provenance & Linked Artifacts');
    if (commitHashes.length > 0) {
      sections.push(`- **Related Commits:** ${commitHashes.join(', ')}`);
    }
    if (prUrls.length > 0) {
      sections.push(`- **Linked PRs:** ${prUrls.join(', ')}`);
    }
  }

  const markdown_prompt = sections.join('\n\n');

  return {
    item: {
      id: item.id,
      external_ref_id: item.external_ref_id,
      title: item.title,
      item_type: item.item_type,
      status: item.status,
      description: item.description,
      metadata: item.metadata,
      parent_id: (item as any).parent_id,
    },
    project,
    hierarchy,
    agent_prompt: rawAgentPrompt,
    acceptance_criteria: acceptanceCriteria,
    technical_constraints: technicalConstraints,
    commit_hashes: commitHashes,
    pr_urls: prUrls,
    markdown_prompt,
  };
}
