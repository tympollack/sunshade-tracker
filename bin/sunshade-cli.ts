#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';

export interface CliConfig {
  baseUrl: string;
  apiKey: string;
  tenantSlug: string;
  projectSlug: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function loadCliConfig(overrides: Partial<CliConfig> = {}): CliConfig {
  let apiKey = overrides.apiKey || process.env.SUNSHADE_API_KEY || process.env.TRACKER_API_KEY;
  let baseUrl = overrides.baseUrl || process.env.SUNSHADE_BASE_URL || process.env.TRACKER_BASE_URL;
  let tenantSlug = overrides.tenantSlug || process.env.TRACKER_TENANT || process.env.SUNSHADE_TENANT;
  let projectSlug = overrides.projectSlug || process.env.TRACKER_PROJECT || process.env.SUNSHADE_PROJECT;

  if (!apiKey || !baseUrl || !tenantSlug || !projectSlug) {
    const candidateFiles = ['.env.local', '.env', '.tracker.json'];
    for (const file of candidateFiles) {
      const fullPath = path.resolve(process.cwd(), file);
      if (fs.existsSync(fullPath)) {
        try {
          if (file.endsWith('.json')) {
            const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            if (!apiKey && data.apiKey) apiKey = data.apiKey;
            if (!baseUrl && data.baseUrl) baseUrl = data.baseUrl;
            if (!tenantSlug && data.tenantSlug) tenantSlug = data.tenantSlug;
            if (!projectSlug && data.projectSlug) projectSlug = data.projectSlug;
          } else {
            const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
            for (const line of lines) {
              const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
              if (match) {
                const [, k, v] = match;
                const clean = (v || '').trim().replace(/^['"]|['"]$/g, '');
                if ((k === 'SUNSHADE_API_KEY' || k === 'TRACKER_API_KEY') && !apiKey) apiKey = clean;
                if ((k === 'SUNSHADE_BASE_URL' || k === 'TRACKER_BASE_URL') && !baseUrl) baseUrl = clean;
                if ((k === 'TRACKER_TENANT' || k === 'SUNSHADE_TENANT') && !tenantSlug) tenantSlug = clean;
                if ((k === 'TRACKER_PROJECT' || k === 'SUNSHADE_PROJECT') && !projectSlug) projectSlug = clean;
              }
            }
          }
        } catch {}
      }
      if (apiKey && baseUrl && tenantSlug && projectSlug) break;
    }
  }

  return {
    baseUrl: (baseUrl || 'https://track.sunshade.icu').replace(/\/$/, ''),
    apiKey: apiKey || '',
    tenantSlug: tenantSlug || 'pym-energy',
    projectSlug: projectSlug || 'sunshade-tracker',
  };
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  initialBackoffMs = 200
): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const res = await globalThis.fetch(url, options);
      if (res.status >= 500 && attempt < maxRetries) {
        attempt++;
        const backoff = initialBackoffMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      return res;
    } catch (err: any) {
      if (attempt < maxRetries) {
        attempt++;
        const backoff = initialBackoffMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw err;
    }
  }
}

export class SunshadeCliApi {
  public config: CliConfig;

  constructor(overrides: Partial<CliConfig> = {}) {
    this.config = loadCliConfig(overrides);
  }

  public async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (!this.config.apiKey) {
      throw new Error(
        'Missing SUNSHADE_API_KEY. Please set the SUNSHADE_API_KEY environment variable or pass --key.'
      );
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof String)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${this.config.baseUrl}/${endpoint.replace(/^\//, '')}`;

    const res = await fetchWithRetry(url, { ...options, headers });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!res.ok) {
      const errMsg = typeof data === 'object' && data?.error ? data.error : String(data || res.statusText);
      throw new Error(`[HTTP ${res.status}] ${errMsg}`);
    }

    return data;
  }

  public async resolveItem(idOrRef: string, projectSlug?: string): Promise<any> {
    const slug = projectSlug || this.config.projectSlug;

    if (UUID_REGEX.test(idOrRef)) {
      const tenantParam = this.config.tenantSlug ? `&tenant_slug=${encodeURIComponent(this.config.tenantSlug)}` : '';
      try {
        const res = await this.request(`/api/v1/items?id=${encodeURIComponent(idOrRef)}${tenantParam}`);
        if (res?.item) return res.item;
      } catch {}
    }

    const slugParam = slug ? `project_slug=${encodeURIComponent(slug)}` : 'all_projects=true';
    const tenantParam = this.config.tenantSlug ? `&tenant_slug=${encodeURIComponent(this.config.tenantSlug)}` : '';
    const res = await this.request(`/api/v1/items?${slugParam}${tenantParam}&include_cold_archive=true`);

    if (Array.isArray(res?.items)) {
      const found = res.items.find((it: any) => it.external_ref_id === idOrRef || it.id === idOrRef);
      if (found) return found;
    }

    throw new Error(`Work item "${idOrRef}" could not be found in project "${slug}".`);
  }

  public async getNextTask(projectSlug?: string): Promise<any> {
    const slug = projectSlug || this.config.projectSlug;
    const tenantParam = this.config.tenantSlug ? `&tenant_slug=${encodeURIComponent(this.config.tenantSlug)}` : '';
    const res = await this.request(`/api/v1/items?project_slug=${encodeURIComponent(slug)}&status=not_started${tenantParam}`);

    const items = Array.isArray(res?.items) ? res.items : [];
    if (items.length === 0) return null;

    const priorityWeights: Record<string, number> = {
      critical: 4,
      urgent: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    items.sort((a: any, b: any) => {
      const pA = String(a.metadata?.priority || '').toLowerCase();
      const pB = String(b.metadata?.priority || '').toLowerCase();
      const weightA = priorityWeights[pA] || 0;
      const weightB = priorityWeights[pB] || 0;

      if (weightA !== weightB) {
        return weightB - weightA;
      }

      const orderA = typeof a.order_index === 'number' ? a.order_index : 999999;
      const orderB = typeof b.order_index === 'number' ? b.order_index : 999999;
      return orderA - orderB;
    });

    return items[0];
  }

  public async claimTask(idOrRef: string, runner?: string, projectSlug?: string): Promise<any> {
    const item = await this.resolveItem(idOrRef, projectSlug);
    const assignedRunner = runner || process.env.SUNSHADE_RUNNER_ID || process.env.AGENT_NAME || 'agent-runner';

    const patchPayload = {
      id: item.id,
      status: 'in_progress',
      assignee: assignedRunner,
    };

    const res = await this.request('/api/v1/items', {
      method: 'PATCH',
      body: patchPayload as any,
    });

    return res?.item || { ...item, ...patchPayload };
  }

  public async completeTask(
    idOrRef: string,
    options: { pr?: string; commit?: string; projectSlug?: string } = {}
  ): Promise<any> {
    const item = await this.resolveItem(idOrRef, options.projectSlug);
    const existingMetadata = (item.metadata || {}) as Record<string, any>;

    const updatedMetadata = { ...existingMetadata };
    if (options.pr) {
      updatedMetadata.pr_url = options.pr;
      const prs = Array.isArray(existingMetadata.pr_urls) ? [...existingMetadata.pr_urls] : [];
      if (!prs.includes(options.pr)) prs.push(options.pr);
      updatedMetadata.pr_urls = prs;
    }
    if (options.commit) {
      updatedMetadata.commit_hash = options.commit;
      const hashes = Array.isArray(existingMetadata.commit_hashes) ? [...existingMetadata.commit_hashes] : [];
      if (!hashes.includes(options.commit)) hashes.push(options.commit);
      updatedMetadata.commit_hashes = hashes;
    }

    const patchPayload = {
      id: item.id,
      status: 'complete',
      metadata: updatedMetadata,
    };

    const res = await this.request('/api/v1/items', {
      method: 'PATCH',
      body: patchPayload as any,
    });

    return res?.item || { ...item, ...patchPayload };
  }

  public async logTaskNote(
    idOrRef: string,
    note: string,
    projectSlug?: string
  ): Promise<any> {
    const item = await this.resolveItem(idOrRef, projectSlug);
    const existingMetadata = (item.metadata || {}) as Record<string, any>;
    const logs = Array.isArray(existingMetadata.runtime_logs) ? [...existingMetadata.runtime_logs] : [];

    logs.push({
      timestamp: new Date().toISOString(),
      note,
    });

    const updatedMetadata = {
      ...existingMetadata,
      runtime_logs: logs,
    };

    const patchPayload = {
      id: item.id,
      metadata: updatedMetadata,
    };

    const res = await this.request('/api/v1/items', {
      method: 'PATCH',
      body: patchPayload as any,
    });

    return res?.item || { ...item, ...patchPayload };
  }
}

export function buildCliProgram(apiOverride?: SunshadeCliApi): Command {
  const program = new Command('sunshade-cli');

  program
    .version('1.0.0')
    .description('Autonomous Agent CLI for SunShade Tracker')
    .option('--project <slug>', 'Target project slug')
    .option('--base-url <url>', 'Override SunShade Tracker base URL')
    .option('--key <api-key>', 'Override Bearer API key')
    .option('--tenant <slug>', 'Override tenant slug')
    .option('--json', 'Output clean, unadorned JSON for stdout piping');

  const getApi = (cmdOptions: any) => {
    if (apiOverride) return apiOverride;
    const globalOpts = program.opts();
    return new SunshadeCliApi({
      projectSlug: cmdOptions.project || globalOpts.project,
      baseUrl: cmdOptions.baseUrl || globalOpts.baseUrl,
      apiKey: cmdOptions.key || globalOpts.key,
      tenantSlug: cmdOptions.tenant || globalOpts.tenant,
    });
  };

  const isJson = (cmdOptions: any) => {
    return Boolean(cmdOptions.json || program.opts().json);
  };

  // 1. task:next --project <slug>
  program
    .command('task:next')
    .description('Query highest-priority card currently in not_started')
    .option('--project <slug>', 'Target project slug')
    .option('--json', 'Output clean unadorned JSON')
    .action(async (options) => {
      try {
        const api = getApi(options);
        const task = await api.getNextTask(options.project);
        if (isJson(options)) {
          console.log(JSON.stringify(task || null, null, 2));
        } else if (task) {
          console.log(`Next Task: [${task.external_ref_id || task.id}] ${task.title}`);
          console.log(`Priority:  ${task.metadata?.priority || 'Normal'} | Points: ${task.metadata?.story_points || 'N/A'}`);
          if (task.description) console.log(`\n${task.description}\n`);
        } else {
          console.log('No pending tasks in not_started.');
        }
      } catch (err: any) {
        if (isJson(options)) {
          console.error(JSON.stringify({ error: err?.message || String(err) }));
        } else {
          console.error('Error:', err?.message || err);
        }
        process.exitCode = 1;
      }
    });

  // 2. task:claim <ref_id>
  program
    .command('task:claim <ref_id>')
    .description('Update status to in_progress and assign runner identity')
    .option('--runner <name>', 'Runner identity (defaults to agent-runner)')
    .option('--project <slug>', 'Target project slug')
    .option('--json', 'Output clean unadorned JSON')
    .action(async (refId, options) => {
      try {
        const api = getApi(options);
        const claimed = await api.claimTask(refId, options.runner, options.project);
        if (isJson(options)) {
          console.log(JSON.stringify(claimed, null, 2));
        } else {
          console.log(`Claimed task [${claimed.external_ref_id || claimed.id}] -> in_progress (Assignee: ${claimed.assignee || 'runner'})`);
        }
      } catch (err: any) {
        if (isJson(options)) {
          console.error(JSON.stringify({ error: err?.message || String(err) }));
        } else {
          console.error('Error:', err?.message || err);
        }
        process.exitCode = 1;
      }
    });

  // 3. task:complete <ref_id>
  program
    .command('task:complete <ref_id>')
    .description('Set status to complete with execution metadata')
    .option('--pr <url>', 'GitHub pull request URL')
    .option('--commit <hash>', 'Commit SHA hash')
    .option('--project <slug>', 'Target project slug')
    .option('--json', 'Output clean unadorned JSON')
    .action(async (refId, options) => {
      try {
        const api = getApi(options);
        const completed = await api.completeTask(refId, {
          pr: options.pr,
          commit: options.commit,
          projectSlug: options.project,
        });
        if (isJson(options)) {
          console.log(JSON.stringify(completed, null, 2));
        } else {
          console.log(`Completed task [${completed.external_ref_id || completed.id}] -> complete`);
          if (options.pr) console.log(`PR:     ${options.pr}`);
          if (options.commit) console.log(`Commit: ${options.commit}`);
        }
      } catch (err: any) {
        if (isJson(options)) {
          console.error(JSON.stringify({ error: err?.message || String(err) }));
        } else {
          console.error('Error:', err?.message || err);
        }
        process.exitCode = 1;
      }
    });

  // 4. task:log <ref_id>
  program
    .command('task:log <ref_id>')
    .description('Append runtime notes or Antigravity logs to card metadata')
    .requiredOption('--note <text>', 'Runtime note or log string to append')
    .option('--project <slug>', 'Target project slug')
    .option('--json', 'Output clean unadorned JSON')
    .action(async (refId, options) => {
      try {
        const api = getApi(options);
        const logged = await api.logTaskNote(refId, options.note, options.project);
        if (isJson(options)) {
          console.log(JSON.stringify(logged, null, 2));
        } else {
          console.log(`Appended note to [${logged.external_ref_id || logged.id}]`);
        }
      } catch (err: any) {
        if (isJson(options)) {
          console.error(JSON.stringify({ error: err?.message || String(err) }));
        } else {
          console.error('Error:', err?.message || err);
        }
        process.exitCode = 1;
      }
    });

  return program;
}

// When executed directly as CLI script
if (process.argv[1]?.endsWith('sunshade-cli.ts') || process.argv[1]?.endsWith('sunshade-cli')) {
  const program = buildCliProgram();
  program.parseAsync(process.argv).catch((err) => {
    console.error('Fatal CLI execution error:', err);
    process.exit(1);
  });
}
