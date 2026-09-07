#!/usr/bin/env node

/**
 * SunShade Tracker CLI
 * Generic runnable script for CRUD and batch operations against the SunShade Tracker API.
 * 
 * Usage:
 *   node scripts/tracker.mjs <command> [arguments] [options]
 * 
 * Commands:
 *   get <id|ref>                          Fetch item details by UUID or external_ref_id
 *   list [options]                        List items with optional filters
 *   create --title "..." [options]        Create a new work item
 *   update <id|ref> [options]             Update work item fields
 *   complete <id|ref> [options]           Mark an item complete and append to complete column
 *   delete <id|ref>                       Soft-delete a work item
 *   ingest <file.json>                    Ingest batch items from a JSON file
 *   projects                              List workspace projects and settings
 *   exec <METHOD> <PATH> [BODY_JSON]      Arbitrary API request with auth
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ─── Fractional Index Calculation ─────────────────────────────────────────────
function calculateOrderIndex(prevOrder, nextOrder) {
  const DEFAULT_START = 1000.0;
  const DEFAULT_INCREMENT = 1000.0;

  if (prevOrder === undefined && nextOrder === undefined) return DEFAULT_START;
  if (prevOrder === undefined && nextOrder !== undefined) return nextOrder / 2.0;
  if (prevOrder !== undefined && nextOrder === undefined) return prevOrder + DEFAULT_INCREMENT;
  return (prevOrder + nextOrder) / 2.0;
}

// ─── Configuration Loader ─────────────────────────────────────────────────────
function loadConfig() {
  const config = {
    baseUrl: process.env.TRACKER_BASE_URL || 'https://track.sunshade.icu',
    apiKey: process.env.TRACKER_API_KEY || 'tk_live_pym-energy_aca7a776ac614dc4',
    tenantSlug: process.env.TRACKER_TENANT || 'pym-energy',
    projectSlug: process.env.TRACKER_PROJECT || 'sunshade-tracker',
  };

  const candidateFiles = ['.tracker.json', '.tracker-config.json', '.env.local', '.env'];
  for (const filename of candidateFiles) {
    const fullPath = path.join(rootDir, filename);
    if (fs.existsSync(fullPath)) {
      try {
        if (filename.endsWith('.json')) {
          const fileData = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          if (fileData.baseUrl) config.baseUrl = fileData.baseUrl;
          if (fileData.apiKey) config.apiKey = fileData.apiKey;
          if (fileData.tenantSlug) config.tenantSlug = fileData.tenantSlug;
          if (fileData.projectSlug) config.projectSlug = fileData.projectSlug;
        } else {
          const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
          for (const line of lines) {
            const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
            if (match) {
              const [, key, val] = match;
              const cleanVal = (val || '').trim().replace(/^['"]|['"]$/g, '');
              if (key === 'TRACKER_BASE_URL') config.baseUrl = cleanVal;
              if (key === 'TRACKER_API_KEY') config.apiKey = cleanVal;
              if (key === 'TRACKER_TENANT') config.tenantSlug = cleanVal;
              if (key === 'TRACKER_PROJECT') config.projectSlug = cleanVal;
            }
          }
        }
      } catch {}
    }
  }

  return config;
}

// ─── Argument Parser ──────────────────────────────────────────────────────────
function parseArgs(rawArgs) {
  const positional = [];
  const options = {};

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const equalIndex = arg.indexOf('=');
      if (equalIndex !== -1) {
        const key = arg.slice(2, equalIndex);
        const val = arg.slice(equalIndex + 1);
        options[key] = val;
      } else {
        const key = arg.slice(2);
        if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
          options[key] = rawArgs[i + 1];
          i++;
        } else {
          options[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const key = arg.slice(1);
      options[key] = true;
    } else {
      positional.push(arg);
    }
  }

  return { positional, options };
}

// ─── HTTP Client ──────────────────────────────────────────────────────────────
async function apiFetch(config, endpoint, options = {}) {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${config.baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;

  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Accept': 'application/json',
    ...(options.headers || {}),
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof String)) {
    options.body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });
  let data;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, ok: res.ok, data };
}

// ─── UUID Detection & Resolution ──────────────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveItem(config, idOrRef, projectSlug) {
  if (!idOrRef) return null;

  // If it's a UUID, try direct get
  if (UUID_REGEX.test(idOrRef)) {
    const res = await apiFetch(config, `/api/v1/items?id=${idOrRef}&tenant_slug=${config.tenantSlug}`);
    if (res.ok && res.data?.item) {
      return res.data.item;
    }
  }

  // Look up by external_ref_id or fallback scan across project items
  const proj = projectSlug || config.projectSlug;
  const listRes = await apiFetch(config, `/api/v1/items?project_slug=${proj}`);
  if (listRes.ok && Array.isArray(listRes.data?.items)) {
    const found = listRes.data.items.find(
      (it) => it.external_ref_id === idOrRef || it.id === idOrRef
    );
    if (found) return found;
  }

  return null;
}

// ─── Command: GET ─────────────────────────────────────────────────────────────
async function cmdGet(config, positional, options) {
  const target = positional[0] || options.id || options.ref;
  if (!target) {
    console.error('Error: Item ID or reference ID is required. Example: node scripts/tracker.mjs get TASK-101');
    process.exit(1);
  }

  const projectSlug = options.project || config.projectSlug;
  const item = await resolveItem(config, target, projectSlug);

  if (!item) {
    console.error(`Error: Work item '${target}' not found in project '${projectSlug}'.`);
    process.exit(1);
  }

  if (options.json || options.j) {
    console.log(JSON.stringify(item, null, 2));
    return;
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(` WORK ITEM: [${item.external_ref_id || 'NO-REF'}] ${item.title}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`ID:           ${item.id}`);
  console.log(`Ref ID:       ${item.external_ref_id || '(none)'}`);
  console.log(`Type:         ${item.item_type}`);
  console.log(`Status:       ${item.status}`);
  console.log(`Assignee:     ${item.assignee || 'unassigned'}`);
  console.log(`Parent ID:    ${item.parent_id || '(root / none)'}`);
  console.log(`Order Index:  ${item.order_index}`);
  console.log(`Project ID:   ${item.project_id}`);
  console.log(`Updated At:   ${item.updated_at}`);
  if (item.description) {
    console.log(`\nDescription:\n  ${item.description}`);
  }
  if (item.metadata && Object.keys(item.metadata).length > 0) {
    console.log('\nMetadata:');
    for (const [k, v] of Object.entries(item.metadata)) {
      if (k === 'agent_prompt' && typeof v === 'string' && !options.full) {
        console.log(`  - ${k}: ${v.slice(0, 80)}... (use --full to show complete prompt)`);
      } else {
        console.log(`  - ${k}: ${JSON.stringify(v)}`);
      }
    }
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// ─── Command: LIST ────────────────────────────────────────────────────────────
async function cmdList(config, positional, options) {
  const projectSlug = options.project || config.projectSlug;
  const queryParts = [`project_slug=${encodeURIComponent(projectSlug)}`];
  if (options.status) queryParts.push(`status=${encodeURIComponent(options.status)}`);
  if (options.type) queryParts.push(`type=${encodeURIComponent(options.type)}`);

  const res = await apiFetch(config, `/api/v1/items?${queryParts.join('&')}`);
  if (!res.ok) {
    console.error(`Failed to list items: ${res.status}`, res.data);
    process.exit(1);
  }

  let items = res.data?.items || [];

  if (options.sprint) {
    items = items.filter((it) => it.metadata?.sprint === options.sprint);
  }
  if (options.assignee) {
    items = items.filter((it) => it.assignee === options.assignee);
  }

  if (options.json || options.j) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  const limit = options.limit ? parseInt(options.limit, 10) : items.length;
  const displayed = items.slice(0, limit);

  console.log(`\nProject: ${projectSlug} (${items.length} items total, displaying ${displayed.length})`);
  console.log('─'.repeat(110));
  console.log(
    'Ref ID'.padEnd(28) +
    'Type'.padEnd(10) +
    'Status'.padEnd(14) +
    'Pts'.padEnd(6) +
    'Assignee'.padEnd(14) +
    'Title'
  );
  console.log('─'.repeat(110));

  for (const it of displayed) {
    const ref = (it.external_ref_id || it.id.slice(0, 8)).padEnd(28);
    const type = (it.item_type || 'task').padEnd(10);
    const status = (it.status || 'not_started').padEnd(14);
    const pts = String(it.metadata?.story_points ?? '-').padEnd(6);
    const assignee = (it.assignee || 'unassigned').slice(0, 12).padEnd(14);
    const title = it.title || '';
    console.log(`${ref}${type}${status}${pts}${assignee}${title}`);
  }
  console.log('─'.repeat(110) + '\n');
}

// ─── Command: CREATE ──────────────────────────────────────────────────────────
async function cmdCreate(config, positional, options) {
  const title = options.title || positional.join(' ');
  if (!title) {
    console.error('Error: --title is required. Example: node scripts/tracker.mjs create --title "Build feature"');
    process.exit(1);
  }

  const projectSlug = options.project || config.projectSlug;
  let resolvedParentId = null;

  if (options.parent) {
    const parentItem = await resolveItem(config, options.parent, projectSlug);
    if (parentItem) {
      resolvedParentId = parentItem.id;
    } else if (UUID_REGEX.test(options.parent)) {
      resolvedParentId = options.parent;
    } else {
      console.warn(`Warning: Parent '${options.parent}' could not be resolved. Skipping parent assignment.`);
    }
  }

  const metadata = {};
  if (options.points) metadata.story_points = Number(options.points);
  if (options.sprint) metadata.sprint = options.sprint;
  if (options.priority) metadata.priority = options.priority;
  if (options.complexity) metadata.complexity = Number(options.complexity);
  if (options.prompt) metadata.agent_prompt = options.prompt;
  if (options.pr) metadata.pr_url = options.pr;
  if (options.commit) metadata.commit_hash = options.commit;

  const payload = {
    project_slug: projectSlug,
    title,
    description: options.description || options.desc || null,
    item_type: options.type || 'task',
    status: options.status || 'not_started',
    assignee: options.assignee || null,
    external_ref_id: options.ref || null,
    parent_id: resolvedParentId,
    metadata,
  };

  const res = await apiFetch(config, '/api/v1/items', {
    method: 'POST',
    body: payload,
  });

  if (!res.ok) {
    console.error(`Failed to create work item (${res.status}):`, res.data);
    process.exit(1);
  }

  console.log('\n✓ Work item created successfully:');
  console.log(`  ID:     ${res.data.item?.id}`);
  console.log(`  Ref:    ${res.data.item?.external_ref_id || '(none)'}`);
  console.log(`  Type:   ${res.data.item?.item_type}`);
  console.log(`  Status: ${res.data.item?.status}`);
  console.log(`  Title:  ${res.data.item?.title}\n`);
}

// ─── Command: UPDATE ──────────────────────────────────────────────────────────
async function cmdUpdate(config, positional, options) {
  const target = positional[0] || options.id || options.ref;
  if (!target) {
    console.error('Error: Item ID or reference ID is required. Example: node scripts/tracker.mjs update TASK-101 --status complete');
    process.exit(1);
  }

  const projectSlug = options.project || config.projectSlug;
  const item = await resolveItem(config, target, projectSlug);
  if (!item) {
    console.error(`Error: Work item '${target}' not found in project '${projectSlug}'.`);
    process.exit(1);
  }

  const updatePayload = { id: item.id };

  if (options.title) updatePayload.title = options.title;
  if (options.description || options.desc) updatePayload.description = options.description || options.desc;
  if (options.status) updatePayload.status = options.status;
  if (options.type) updatePayload.item_type = options.type;
  if (options.assignee !== undefined) updatePayload.assignee = options.assignee === 'none' ? null : options.assignee;
  if (options['ref-id'] || options.new_ref) updatePayload.external_ref_id = options['ref-id'] || options.new_ref;

  if (options.parent !== undefined) {
    if (options.parent === 'none' || options.parent === 'null') {
      updatePayload.parent_id = null;
    } else {
      const p = await resolveItem(config, options.parent, projectSlug);
      updatePayload.parent_id = p ? p.id : options.parent;
    }
  }

  // Handle order index / ordering
  if (options.order) {
    updatePayload.order_index = Number(options.order);
  } else if (options['order-after']) {
    const prevItem = await resolveItem(config, options['order-after'], projectSlug);
    if (prevItem) {
      updatePayload.prev_order = prevItem.order_index;
    }
  }

  // Metadata updates
  const metaUpdates = {};
  if (options.points !== undefined) metaUpdates.story_points = Number(options.points);
  if (options.sprint !== undefined) metaUpdates.sprint = options.sprint;
  if (options.priority !== undefined) metaUpdates.priority = options.priority;
  if (options.complexity !== undefined) metaUpdates.complexity = Number(options.complexity);
  if (options.prompt !== undefined) metaUpdates.agent_prompt = options.prompt;
  if (options.pr !== undefined) metaUpdates.pr_url = options.pr;
  if (options.commit !== undefined) metaUpdates.commit_hash = options.commit;

  if (Object.keys(metaUpdates).length > 0) {
    updatePayload.metadata = { ...(item.metadata || {}), ...metaUpdates };
  }

  const res = await apiFetch(config, '/api/v1/items', {
    method: 'PATCH',
    body: updatePayload,
  });

  if (!res.ok) {
    console.error(`Failed to update item (${res.status}):`, res.data);
    process.exit(1);
  }

  console.log(`\n✓ Work item '${item.external_ref_id || item.id}' updated successfully:`);
  console.log(`  Status: ${res.data.item?.status}`);
  console.log(`  Title:  ${res.data.item?.title}`);
  if (updatePayload.order_index || updatePayload.prev_order) {
    console.log(`  Order:  ${res.data.item?.order_index}`);
  }
  console.log();
}

// ─── Command: COMPLETE ────────────────────────────────────────────────────────
async function cmdComplete(config, positional, options) {
  const target = positional[0] || options.id || options.ref;
  if (!target) {
    console.error('Error: Item ID or reference ID is required. Example: node scripts/tracker.mjs complete TASK-101');
    process.exit(1);
  }

  const projectSlug = options.project || config.projectSlug;
  const item = await resolveItem(config, target, projectSlug);
  if (!item) {
    console.error(`Error: Work item '${target}' not found in project '${projectSlug}'.`);
    process.exit(1);
  }

  // Query all project items to find last complete order_index
  const listRes = await apiFetch(config, `/api/v1/items?project_slug=${projectSlug}`);
  let lastOrder = 1000.0;
  if (listRes.ok && Array.isArray(listRes.data?.items)) {
    const completeItems = listRes.data.items
      .filter((it) => it.status === 'complete' && it.id !== item.id)
      .sort((a, b) => a.order_index - b.order_index);

    if (completeItems.length > 0) {
      lastOrder = completeItems[completeItems.length - 1].order_index;
    }
  }

  const newOrder = calculateOrderIndex(lastOrder, undefined);
  const metadata = { ...(item.metadata || {}) };
  if (options.pr) metadata.pr_url = options.pr;
  if (options.commit) metadata.commit_hash = options.commit;

  const res = await apiFetch(config, '/api/v1/items', {
    method: 'PATCH',
    body: {
      id: item.id,
      status: 'complete',
      prev_order: lastOrder,
      metadata,
    },
  });

  if (!res.ok) {
    console.error(`Failed to mark item complete (${res.status}):`, res.data);
    process.exit(1);
  }

  console.log(`\n✓ Work item completed: [${item.external_ref_id || item.id}] ${item.title}`);
  console.log(`  Status:      complete`);
  console.log(`  Order Index: ${res.data.item?.order_index || newOrder}`);
  if (metadata.pr_url) console.log(`  PR:          ${metadata.pr_url}`);
  if (metadata.commit_hash) console.log(`  Commit:      ${metadata.commit_hash}`);
  console.log();
}

// ─── Command: DELETE ──────────────────────────────────────────────────────────
async function cmdDelete(config, positional, options) {
  const target = positional[0] || options.id || options.ref;
  if (!target) {
    console.error('Error: Item ID or reference ID is required. Example: node scripts/tracker.mjs delete TASK-101');
    process.exit(1);
  }

  const projectSlug = options.project || config.projectSlug;
  const item = await resolveItem(config, target, projectSlug);
  if (!item) {
    console.error(`Error: Work item '${target}' not found in project '${projectSlug}'.`);
    process.exit(1);
  }

  const res = await apiFetch(config, '/api/v1/items', {
    method: 'DELETE',
    body: { id: item.id },
  });

  if (!res.ok) {
    console.error(`Failed to delete item (${res.status}):`, res.data);
    process.exit(1);
  }

  console.log(`\n✓ Work item soft-deleted: [${item.external_ref_id || item.id}] ${item.title}\n`);
}

// ─── Command: INGEST ──────────────────────────────────────────────────────────
async function cmdIngest(config, positional, options) {
  const filePath = positional[0] || options.file;
  if (!filePath) {
    console.error('Error: JSON file path is required. Example: node scripts/tracker.mjs ingest ./tasks.json');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: File not found at '${resolvedPath}'`);
    process.exit(1);
  }

  let fileContent;
  try {
    fileContent = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (err) {
    console.error(`Error parsing JSON file '${resolvedPath}':`, err.message);
    process.exit(1);
  }

  const projectSlug = options.project || fileContent.project_slug || config.projectSlug;
  const items = Array.isArray(fileContent) ? fileContent : fileContent.items;

  if (!Array.isArray(items) || items.length === 0) {
    console.error('Error: Ingestion payload must contain an array of items.');
    process.exit(1);
  }

  console.log(`\nIngesting ${items.length} items into project '${projectSlug}'...`);

  const payload = {
    project_slug: projectSlug,
    items,
  };

  const res = await apiFetch(config, '/api/v1/items/ingest', {
    method: 'POST',
    body: payload,
  });

  if (!res.ok) {
    console.error(`Ingestion failed (${res.status}):`, res.data);
    process.exit(1);
  }

  console.log(`✓ Successfully ingested ${res.data.count || items.length} items:`);
  if (Array.isArray(res.data.items)) {
    for (const it of res.data.items) {
      console.log(`  - [${it.external_ref_id || 'NO-REF'}] (${it.item_type}/${it.status}): ${it.title} (id: ${it.id})`);
    }
  }
  console.log();
}

// ─── Command: PROJECTS ────────────────────────────────────────────────────────
async function cmdProjects(config, positional, options) {
  const res = await apiFetch(config, `/api/v1/projects?tenant_slug=${config.tenantSlug}`);
  if (!res.ok) {
    console.error(`Failed to fetch projects (${res.status}):`, res.data);
    process.exit(1);
  }

  const projects = res.data?.projects || [];
  if (options.json || options.j) {
    console.log(JSON.stringify(projects, null, 2));
    return;
  }

  console.log(`\nWorkspace: ${config.tenantSlug} (${projects.length} projects)`);
  console.log('─'.repeat(80));
  for (const p of projects) {
    console.log(`Project: ${p.name} (slug: ${p.slug}, id: ${p.id})`);
    if (p.settings?.statuses) {
      const statuses = p.settings.statuses.map((s) => s.label).join(' → ');
      console.log(`  Statuses:  ${statuses}`);
    }
    if (p.settings?.hierarchy) {
      const levels = p.settings.hierarchy.map((h) => h.label).join(' > ');
      console.log(`  Hierarchy: ${levels}`);
    }
    console.log('─'.repeat(80));
  }
  console.log();
}

// ─── Command: EXEC (Escape Hatch) ─────────────────────────────────────────────
async function cmdExec(config, positional, options) {
  const method = (positional[0] || 'GET').toUpperCase();
  const endpoint = positional[1];
  if (!endpoint) {
    console.error('Error: Endpoint required. Example: node scripts/tracker.mjs exec GET /api/v1/projects');
    process.exit(1);
  }

  let body = null;
  if (positional[2]) {
    try {
      body = JSON.parse(positional[2]);
    } catch {
      body = positional[2];
    }
  }

  const res = await apiFetch(config, endpoint, { method, body });
  console.log(`HTTP ${res.status}`);
  console.log(typeof res.data === 'object' ? JSON.stringify(res.data, null, 2) : res.data);
}

// ─── Help ─────────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
SunShade Tracker CLI
Generic runnable script for CRUD and batch operations against the tracker.

Usage:
  node scripts/tracker.mjs <command> [args] [options]

Commands:
  get <id|ref>                          Fetch item details by UUID or ref tag
  list [options]                        List items with optional filters
  create --title "..." [options]        Create a new work item
  update <id|ref> [options]             Update work item fields
  complete <id|ref> [options]           Mark complete and place at bottom of Complete column
  delete <id|ref>                       Soft-delete a work item
  ingest <file.json>                    Ingest batch items from a JSON file
  projects                              List workspace projects and settings
  exec <METHOD> <PATH> [BODY_JSON]      Arbitrary API call with tenant auth

Global Options:
  --project <slug>     Target project slug (default: sunshade-tracker)
  --tenant <slug>      Target tenant slug (default: pym-energy)
  --key <api-key>      Override API bearer token
  --base-url <url>     Override API base URL (default: https://track.sunshade.icu)
  --json, -j           Output raw JSON

Examples:
  node scripts/tracker.mjs get TASK-TRK-CARD-LIMITS
  node scripts/tracker.mjs list --status in_progress
  node scripts/tracker.mjs complete TASK-TRK-CARD-LIMITS --pr https://github.com/...
  node scripts/tracker.mjs update TASK-101 --status in_progress --assignee tympollack
  node scripts/tracker.mjs create --title "New Task" --type task --points 3 --parent STORY-101
  node scripts/tracker.mjs ingest ./scratch/payload.json
`);
}

// ─── Main Dispatcher & Exported Runner ─────────────────────────────────────────
export async function run(command, rawArgs = []) {
  if (!command || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printHelp();
    return;
  }

  const { positional, options } = parseArgs(rawArgs);
  const config = loadConfig();

  // CLI overrides
  if (options.project) config.projectSlug = options.project;
  if (options.tenant) config.tenantSlug = options.tenant;
  if (options.key) config.apiKey = options.key;
  if (options['base-url']) config.baseUrl = options['base-url'];

  switch (command.toLowerCase()) {
    case 'get':
      await cmdGet(config, positional, options);
      break;
    case 'list':
      await cmdList(config, positional, options);
      break;
    case 'create':
      await cmdCreate(config, positional, options);
      break;
    case 'update':
    case 'patch':
      await cmdUpdate(config, positional, options);
      break;
    case 'complete':
      await cmdComplete(config, positional, options);
      break;
    case 'delete':
    case 'remove':
      await cmdDelete(config, positional, options);
      break;
    case 'ingest':
      await cmdIngest(config, positional, options);
      break;
    case 'projects':
      await cmdProjects(config, positional, options);
      break;
    case 'exec':
      await cmdExec(config, positional, options);
      break;
    default:
      console.error(`Unknown command: '${command}'. Run 'node scripts/tracker.mjs --help' for usage.`);
      process.exit(1);
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printHelp();
    return;
  }

  const command = rawArgs[0].toLowerCase();
  await run(command, rawArgs.slice(1));
}

// Only auto-execute main if run directly
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('tracker.mjs') ||
  process.argv[1].endsWith('tracker')
);

if (isDirectExecution) {
  main().catch((err) => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
  });
}

