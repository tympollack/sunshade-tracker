import { IngestItemPayload } from '@/types/tracker';

export interface DecomposedItem {
  level: 2 | 3 | 4; // 2 = Story, 3 = Task, 4 = Subtask
  item_type: 'story' | 'task' | 'subtask';
  title: string;
  description: string;
  external_ref_id: string;
  parent_ref_id: string | null;
  order_index?: number;
  metadata: {
    agent_prompt: string;
    acceptance_criteria: string[];
    complexity?: number;
    story_points?: number;
    priority?: string;
    [key: string]: any;
  };
}

export interface SwarmDecompositionOptions {
  featurePrefix: string;
  projectSlug: string;
  prdDocument: string;
  llmProvider?: (prompt: string) => Promise<string>;
  baseUrl?: string;
  apiKey?: string;
  overrideSprint?: string | null;
  overrideAssignee?: string | null;
  projectSettings?: any;
}

export interface SwarmDecompositionResult {
  project_slug: string;
  items: DecomposedItem[];
  dispatchResult?: {
    success: boolean;
    count: number;
    items: Array<{
      id: string;
      external_ref_id: string;
      parent_id: string | null;
      title: string;
      item_type: string;
    }>;
  };
}

/**
 * Builds the LLM reasoning prompt requesting hierarchical decomposition into
 * Level 2 (Story), Level 3 (Task), and Level 4 (Subtask).
 */
export function buildDecompositionPrompt(prdDocument: string, featurePrefix: string): string {
  return `You are a Principal Software Architect & Multi-Agent Swarm Orchestrator.
Analyze the following Product Requirements Document (PRD) or Technical Specification and decompose it into an atomic, 3-tier work item hierarchy:
- Level 2: Stories (Macro feature deliverables)
- Level 3: Tasks (Actionable engineering components under each Story)
- Level 4: Subtasks (Atomic implementation units, tests, or migrations under each Task)

Target Feature Prefix: "${featurePrefix}"

Return ONLY a valid JSON array where each object has:
- "level": 2 | 3 | 4
- "item_type": "story" | "task" | "subtask"
- "title": string
- "description": string
- "story_index": number (1-based index of the parent story)
- "task_index": number (1-based index of task within story; omit or 0 for story)
- "subtask_index": number (1-based index of subtask within task; omit or 0 for story/task)
- "acceptance_criteria": string[]
- "complexity": 1 | 2 | 3 | 4 | 5
- "story_points": number
- "priority": "Critical" | "High" | "Medium" | "Low"

Document:
${prdDocument}
`;
}

/**
 * Synthesizes a standardized agent execution prompt for child tasks.
 */
export function synthesizeAgentPrompt(
  item: { title: string; item_type: string; description: string; parent_ref_id: string | null },
  acceptanceCriteria: string[],
  constraints: string[] = []
): string {
  const roleTitle =
    item.item_type === 'subtask'
      ? 'Autonomous Precision Code Specialist'
      : item.item_type === 'task'
      ? 'Senior Full-Stack Implementation Engineer'
      : 'Epic & Architecture Delivery Lead';

  const sections: string[] = [
    `### SYSTEM ROLE & OBJECTIVE\nYou are an ${roleTitle}. Implement: ${item.title}.`,
    `### CONTEXT & SCOPE\n- Target Component: ${item.title}\n- Parent Reference: ${item.parent_ref_id || 'Root'}\n- Description: ${item.description}`,
  ];

  if (acceptanceCriteria.length > 0) {
    sections.push(`### ACCEPTANCE CRITERIA\n${acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`);
  }

  if (constraints.length > 0) {
    sections.push(`### TECHNICAL CONSTRAINTS\n${constraints.map((c) => `- ${c}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Rule-based heuristic fallback parser that decomposes markdown PRDs
 * with standard headings into Story, Task, and Subtask levels.
 */
export function parsePrdHeuristic(prdDocument: string, featurePrefix: string): DecomposedItem[] {
  const items: DecomposedItem[] = [];
  const lines = prdDocument.split('\n');

  let currentStoryRef: string | null = null;
  let currentTaskRef: string | null = null;
  let storyCount = 0;
  let taskCount = 0;
  let subtaskCount = 0;
  let orderIndex = 1000.0;

  let currentTitle = '';
  let currentDesc: string[] = [];
  let currentLevel: 2 | 3 | 4 = 2;
  let currentCriteria: string[] = [];

  const flushCurrent = () => {
    if (!currentTitle) return;

    const cleanPrefix = featurePrefix.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
    let refId = '';
    let parentRef: string | null = null;

    if (currentLevel === 2) {
      storyCount++;
      taskCount = 0;
      subtaskCount = 0;
      refId = `STORY-${cleanPrefix}-${storyCount}`;
      currentStoryRef = refId;
      currentTaskRef = null;
      parentRef = null;
    } else if (currentLevel === 3) {
      taskCount++;
      subtaskCount = 0;
      refId = `TASK-${cleanPrefix}-${storyCount}-${taskCount}`;
      currentTaskRef = refId;
      parentRef = currentStoryRef;
    } else {
      subtaskCount++;
      refId = `SUBTASK-${cleanPrefix}-${storyCount}-${taskCount}-${subtaskCount}`;
      parentRef = currentTaskRef || currentStoryRef;
    }

    const descText = currentDesc.join('\n').trim();
    const criteria = currentCriteria.length > 0 ? currentCriteria : [`Resolve requirements for ${currentTitle}`];

    const agentPrompt = synthesizeAgentPrompt(
      {
        title: currentTitle,
        item_type: currentLevel === 2 ? 'story' : currentLevel === 3 ? 'task' : 'subtask',
        description: descText,
        parent_ref_id: parentRef,
      },
      criteria
    );

    items.push({
      level: currentLevel,
      item_type: currentLevel === 2 ? 'story' : currentLevel === 3 ? 'task' : 'subtask',
      title: currentTitle,
      description: descText,
      external_ref_id: refId,
      parent_ref_id: parentRef,
      order_index: orderIndex,
      metadata: {
        agent_prompt: agentPrompt,
        acceptance_criteria: criteria,
        complexity: currentLevel === 2 ? 3 : currentLevel === 3 ? 2 : 1,
        story_points: currentLevel === 2 ? 5 : currentLevel === 3 ? 3 : 1,
        priority: 'High',
      },
    });

    orderIndex += 1000.0;
    currentTitle = '';
    currentDesc = [];
    currentCriteria = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('# ') || trimmed.startsWith('## ')) {
      flushCurrent();
      currentLevel = 2;
      currentTitle = trimmed.replace(/^#+\s*/, '').replace(/^(Story|Feature):\s*/i, '');
    } else if (trimmed.startsWith('### ')) {
      flushCurrent();
      currentLevel = 3;
      currentTitle = trimmed.replace(/^#+\s*/, '').replace(/^Task:\s*/i, '');
    } else if (trimmed.startsWith('#### ')) {
      flushCurrent();
      currentLevel = 4;
      currentTitle = trimmed.replace(/^#+\s*/, '').replace(/^Subtask:\s*/i, '');
    } else if (trimmed.match(/^[-*•]\s+\[?[ xX]?\]?\s*(.+)$/)) {
      const match = trimmed.match(/^[-*•]\s+\[?[ xX]?\]?\s*(.+)$/);
      if (match) currentCriteria.push(match[1]);
      currentDesc.push(line);
    } else {
      currentDesc.push(line);
    }
  }

  flushCurrent();

  // If nothing was parsed via headings, create a default 3-tier hierarchy
  if (items.length === 0) {
    const cleanPrefix = featurePrefix.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
    const storyRef = `STORY-${cleanPrefix}-1`;
    const taskRef = `TASK-${cleanPrefix}-1-1`;
    const subtaskRef = `SUBTASK-${cleanPrefix}-1-1-1`;

    items.push(
      {
        level: 2,
        item_type: 'story',
        title: `${featurePrefix} Architecture & Core Flow`,
        description: prdDocument,
        external_ref_id: storyRef,
        parent_ref_id: null,
        order_index: 1000.0,
        metadata: {
          agent_prompt: synthesizeAgentPrompt({ title: `${featurePrefix} Architecture`, item_type: 'story', description: prdDocument, parent_ref_id: null }, ['Deliver architecture']),
          acceptance_criteria: ['Deliver architecture'],
          story_points: 5,
        },
      },
      {
        level: 3,
        item_type: 'task',
        title: `Implement ${featurePrefix} Endpoints and Services`,
        description: `Implement services for ${featurePrefix}`,
        external_ref_id: taskRef,
        parent_ref_id: storyRef,
        order_index: 2000.0,
        metadata: {
          agent_prompt: synthesizeAgentPrompt({ title: `Implement ${featurePrefix} Endpoints`, item_type: 'task', description: `Implement services for ${featurePrefix}`, parent_ref_id: storyRef }, ['Endpoints return 200']),
          acceptance_criteria: ['Endpoints return 200'],
          story_points: 3,
        },
      },
      {
        level: 4,
        item_type: 'subtask',
        title: `Write Integration Tests for ${featurePrefix}`,
        description: `Test coverage for ${featurePrefix}`,
        external_ref_id: subtaskRef,
        parent_ref_id: taskRef,
        order_index: 3000.0,
        metadata: {
          agent_prompt: synthesizeAgentPrompt({ title: `Write Integration Tests for ${featurePrefix}`, item_type: 'subtask', description: `Test coverage for ${featurePrefix}`, parent_ref_id: taskRef }, ['100% test pass']),
          acceptance_criteria: ['100% test pass'],
          story_points: 1,
        },
      }
    );
  }

  return items;
}

/**
 * Normalizes raw LLM parsed objects into deterministic DecomposedItem hierarchy.
 * Uses a pre-pass to register LLM story_index values, ensuring out-of-order stories
 * and tasks preserve correct parent references without orphaned roots.
 */
export function normalizeLlmOutput(rawArray: any[], featurePrefix: string): DecomposedItem[] {
  const cleanPrefix = featurePrefix.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
  const items: DecomposedItem[] = [];

  // Pre-pass: map unique LLM story_index values to deterministic story refs
  const storyIndexToRef = new Map<number, string>();
  let nextStoryNum = 1;

  for (const raw of rawArray) {
    const level: 2 | 3 | 4 = raw.level === 4 ? 4 : raw.level === 3 ? 3 : 2;
    if (level === 2) {
      const rawIdx = typeof raw.story_index === 'number' && raw.story_index > 0 ? raw.story_index : nextStoryNum;
      if (!storyIndexToRef.has(rawIdx)) {
        storyIndexToRef.set(rawIdx, `STORY-${cleanPrefix}-${rawIdx}`);
      }
      nextStoryNum = Math.max(nextStoryNum, rawIdx + 1);
    }
  }

  // Also catch child items pointing to story_index not yet registered
  for (const raw of rawArray) {
    if (raw.story_index && !storyIndexToRef.has(Number(raw.story_index))) {
      const rawIdx = Number(raw.story_index);
      storyIndexToRef.set(rawIdx, `STORY-${cleanPrefix}-${rawIdx}`);
    }
  }

  // Fallback if no stories registered
  if (storyIndexToRef.size === 0) {
    storyIndexToRef.set(1, `STORY-${cleanPrefix}-1`);
  }

  const taskRefs = new Map<string, string>();
  let taskCounter = 0;
  let subtaskCounter = 0;
  let orderIndex = 1000.0;

  for (const raw of rawArray) {
    const level: 2 | 3 | 4 = raw.level === 4 ? 4 : raw.level === 3 ? 3 : 2;
    const item_type = level === 4 ? 'subtask' : level === 3 ? 'task' : 'story';
    const sIdx = raw.story_index || 1;
    const tIdx = raw.task_index || 1;

    let external_ref_id = '';
    let parent_ref_id: string | null = null;

    if (level === 2) {
      external_ref_id = storyIndexToRef.get(sIdx) || `STORY-${cleanPrefix}-${sIdx}`;
      parent_ref_id = null;
    } else if (level === 3) {
      taskCounter++;
      external_ref_id = `TASK-${cleanPrefix}-${sIdx}-${tIdx}`;
      taskRefs.set(`${sIdx}-${tIdx}`, external_ref_id);
      parent_ref_id = storyIndexToRef.get(sIdx) || `STORY-${cleanPrefix}-${sIdx}`;
    } else {
      subtaskCounter++;
      const subIdx = raw.subtask_index || subtaskCounter;
      external_ref_id = `SUBTASK-${cleanPrefix}-${sIdx}-${tIdx}-${subIdx}`;
      parent_ref_id = taskRefs.get(`${sIdx}-${tIdx}`) || storyIndexToRef.get(sIdx) || null;
    }

    const acceptance_criteria: string[] = Array.isArray(raw.acceptance_criteria)
      ? raw.acceptance_criteria
      : [raw.acceptance_criteria || `Deliver ${raw.title}`];

    const agent_prompt = synthesizeAgentPrompt(
      {
        title: raw.title,
        item_type,
        description: raw.description || '',
        parent_ref_id,
      },
      acceptance_criteria
    );

    items.push({
      level,
      item_type,
      title: raw.title,
      description: raw.description || '',
      external_ref_id,
      parent_ref_id,
      order_index: orderIndex,
      metadata: {
        agent_prompt,
        acceptance_criteria,
        complexity: raw.complexity || (level === 2 ? 3 : level === 3 ? 2 : 1),
        story_points: raw.story_points || (level === 2 ? 5 : level === 3 ? 3 : 1),
        priority: raw.priority || 'High',
      },
    });

    orderIndex += 1000.0;
  }

  // Pre-dispatch parent verification & repair
  const allRefIds = new Set(items.map((i) => i.external_ref_id));
  const defaultParentStory = Array.from(storyIndexToRef.values())[0] || null;

  for (const item of items) {
    if (item.level > 2 && item.parent_ref_id && !allRefIds.has(item.parent_ref_id)) {
      if (defaultParentStory && allRefIds.has(defaultParentStory)) {
        item.parent_ref_id = defaultParentStory;
      }
    }
  }

  return items;
}

/**
 * Transforms DecomposedItems into ingestion payloads compatible with POST /api/v1/items/ingest.
 * Respects project taxonomy by mapping dynamic hierarchy levels and initial statuses.
 */
export function toIngestPayloads(
  items: DecomposedItem[],
  projectSettings?: {
    hierarchy?: Array<{ level: number; type: string; allowed_parents?: string[] }>;
    statuses?: Array<{ id: string; order?: number }>;
  } | null
): IngestItemPayload[] {
  // Determine default initial status from project settings if available
  let initialStatus = 'not_started';
  if (projectSettings?.statuses && projectSettings.statuses.length > 0) {
    const sortedStatuses = [...projectSettings.statuses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    initialStatus = sortedStatuses[0].id;
  }

  // Build level-to-type mapping if custom hierarchy is provided
  const levelToType = new Map<number, string>();
  if (projectSettings?.hierarchy && projectSettings.hierarchy.length > 0) {
    for (const h of projectSettings.hierarchy) {
      levelToType.set(h.level, h.type);
    }
  }

  return items.map((item) => {
    let targetType: string = item.item_type;
    if (levelToType.has(item.level)) {
      targetType = levelToType.get(item.level)!;
    } else if (levelToType.size > 0) {
      const sortedLevels = Array.from(levelToType.keys()).sort((a, b) => a - b);
      if (item.level === 2 && sortedLevels.length >= 2) {
        targetType = levelToType.get(sortedLevels[sortedLevels.length - 2]) || item.item_type;
      } else if (item.level >= 3 && sortedLevels.length > 0) {
        targetType = levelToType.get(sortedLevels[sortedLevels.length - 1]) || item.item_type;
      }
    }

    return {
      title: item.title,
      item_type: targetType,
      description: item.description,
      status: initialStatus,
      parent_ref_id: item.parent_ref_id || undefined,
      external_ref_id: item.external_ref_id,
      order_index: item.order_index,
      metadata: item.metadata,
    };
  });
}

/**
 * Autonomous Swarm Decomposition & Delegation Engine
 * Ingests PRD document, runs LLM reasoning (or heuristic fallback), generates
 * deterministic external reference IDs and nested agent prompts, and dispatches
 * the linked hierarchy to the SunShade Tracker ingestion route.
 */
export async function executeSwarmDecomposition(
  options: SwarmDecompositionOptions
): Promise<SwarmDecompositionResult> {
  const { featurePrefix, projectSlug, prdDocument, llmProvider } = options;

  let decomposedItems: DecomposedItem[];

  if (llmProvider) {
    const prompt = buildDecompositionPrompt(prdDocument, featurePrefix);
    const rawOutput = await llmProvider(prompt);
    try {
      const parsedJson = JSON.parse(rawOutput.replace(/^```(json)?\n?/, '').replace(/\n?```$/, ''));
      if (Array.isArray(parsedJson)) {
        decomposedItems = normalizeLlmOutput(parsedJson, featurePrefix);
      } else {
        decomposedItems = parsePrdHeuristic(prdDocument, featurePrefix);
      }
    } catch {
      decomposedItems = parsePrdHeuristic(prdDocument, featurePrefix);
    }
  } else {
    decomposedItems = parsePrdHeuristic(prdDocument, featurePrefix);
  }

  // Ensure items are ordered Story -> Task -> Subtask to guarantee parent resolution
  decomposedItems.sort((a, b) => a.level - b.level);

  // Dispatch to ingestion endpoint if baseUrl / apiKey provided
  const baseUrl = (options.baseUrl || process.env.SUNSHADE_BASE_URL || 'https://track.sunshade.icu').replace(/\/$/, '');
  const apiKey = options.apiKey || process.env.SUNSHADE_API_KEY || process.env.TRACKER_API_KEY || '';

  let settings = options.projectSettings;
  if (!settings && apiKey) {
    try {
      const settingsRes = await globalThis.fetch(
        `${baseUrl}/api/v1/projects/${encodeURIComponent(projectSlug)}/settings`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
        }
      );
      if (settingsRes.ok) {
        const sJson = await settingsRes.json();
        settings = sJson.settings;
      }
    } catch {
      // Proceed with defaults if network or permissions fail
    }
  }

  let dispatchResult: any = undefined;

  if (apiKey) {
    const ingestPayload = {
      project_slug: projectSlug,
      items: toIngestPayloads(decomposedItems, settings),
      override_sprint: options.overrideSprint,
      override_assignee: options.overrideAssignee,
    };

    const res = await globalThis.fetch(`${baseUrl}/api/v1/items/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ingestPayload),
    });

    if (res.ok) {
      dispatchResult = await res.json();
    } else {
      const errText = await res.text();
      throw new Error(`Ingest dispatch failed [HTTP ${res.status}]: ${errText}`);
    }
  }

  return {
    project_slug: projectSlug,
    items: decomposedItems,
    dispatchResult,
  };
}
