export interface CiFailureInput {
  commitSha: string;
  jobName: string;
  prNumber?: string | number | null;
  errorMessage?: string;
  stackTrace?: string;
  failingFilePath?: string;
  projectSlug?: string;
  trackerUrl?: string;
  trackerToken?: string;
}

export interface CiBugItemPayload {
  project_slug: string;
  items: Array<{
    external_ref_id: string;
    item_type: 'bug';
    title: string;
    description: string;
    status: 'not_started';
    metadata: {
      ci_job: string;
      commit_hash: string;
      pr_number?: string | number | null;
      failing_file?: string | null;
      agent_prompt: string;
      priority: 'Critical';
      severity: 'High';
      auto_generated: boolean;
      reported_at: string;
      [key: string]: any;
    };
  }>;
}

/**
 * Builds deterministic external_ref_id for CI failure cards:
 * BUG-CI-<sha8>-<job>
 */
export function formatCiBugRefId(commitSha: string, jobName: string): string {
  const shortSha = (commitSha || 'unknown').slice(0, 8);
  const cleanJob = (jobName || 'check').replace(/\s+/g, '-');
  return `BUG-CI-${shortSha}-${cleanJob}`;
}

/**
 * Synthesizes agent instructions for self-healing the failed CI check.
 */
export function synthesizeCiAgentPrompt(input: {
  commitSha: string;
  jobName: string;
  failingFilePath?: string;
  errorMessage?: string;
  prNumber?: string | number | null;
}): string {
  const fileTarget = input.failingFilePath ? `\n- Target File: \`${input.failingFilePath}\`` : '';
  const prTarget = input.prNumber ? `\n- Pull Request: #${input.prNumber}` : '';

  return `### SYSTEM ROLE & OBJECTIVE
You are an Autonomous CI/CD Debugging & Remediation Specialist.
Analyze and repair the continuous integration failure reported in job "${input.jobName}".

### CONTEXT & PROVENANCE
- Failing Job: ${input.jobName}
- Commit SHA: \`${input.commitSha}\`${prTarget}${fileTarget}
- Failure Summary: ${input.errorMessage || 'Automated test or build step failed.'}

### REMEDIATION INSTRUCTIONS
1. Inspect the failing file or check logs around commit \`${input.commitSha}\`.
2. Replicate the failure locally by running the appropriate test or build command.
3. Formulate the minimal bugfix preserving existing behavior and documentation.
4. Verify all tests pass with \`npx tsc --noEmit\` and \`npm test\`.
5. Transition this card to \`in_review\` upon opening the remediation pull request.
`;
}

/**
 * Sanitizes and redacts credentials, secrets, and auth tokens from stack traces.
 */
export function sanitizeLogSecrets(log: string, additionalSecrets: string[] = []): string {
  let sanitized = log;
  for (const secret of additionalSecrets) {
    if (secret && secret.length >= 6) {
      sanitized = sanitized.split(secret).join('[REDACTED_SECRET]');
    }
  }
  return sanitized
    .replace(/(?:ghp_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,})/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/(?:tk_live_[a-z0-9_]{16,}|tk_test_[a-z0-9_]{16,})/g, '[REDACTED_TRACKER_KEY]')
    .replace(/(?:Bearer\s+)[A-Za-z0-9_.-]{16,}/gi, 'Bearer [REDACTED]')
    .replace(/(?:password|secret|token|api_key|apikey|private_key)["\s:=]+(?!(?:\[REDACTED))[^\s",;}\]]{6,}/gi, (match) => {
      const prefix = match.split(/["\s:=]+/)[0];
      return `${prefix}: "[REDACTED]"`;
    });
}

/**
 * Constructs the structured ingestion payload adhering to the tracker schema.
 */
export function constructCiFailurePayload(input: CiFailureInput): CiBugItemPayload {
  const projectSlug = input.projectSlug || 'sunshade-tracker';
  const refId = formatCiBugRefId(input.commitSha, input.jobName);
  const summaryTitle = input.errorMessage
    ? `CI Failure: ${input.errorMessage.slice(0, 70)}`
    : `CI Failure in ${input.jobName} (${input.commitSha.slice(0, 8)})`;

  const rawStack = input.stackTrace || input.errorMessage || 'No stack trace captured';
  const sanitizedStack = sanitizeLogSecrets(rawStack, input.trackerToken ? [input.trackerToken] : []);
  const trimmedStack = sanitizedStack
    .split('\n')
    .slice(0, 30)
    .join('\n');

  const description = `### Automated CI Failure Report
> **Job:** \`${input.jobName}\`  
> **Commit:** \`${input.commitSha}\`${input.prNumber ? `  \n> **PR:** #${input.prNumber}` : ''}${input.failingFilePath ? `  \n> **File:** \`${input.failingFilePath}\`` : ''}${input.errorMessage ? `  \n> **Error:** ${input.errorMessage}` : ''}

\`\`\`
${trimmedStack}
\`\`\`
`;

  const agentPrompt = synthesizeCiAgentPrompt({
    commitSha: input.commitSha,
    jobName: input.jobName,
    failingFilePath: input.failingFilePath,
    errorMessage: input.errorMessage,
    prNumber: input.prNumber,
  });

  return {
    project_slug: projectSlug,
    items: [
      {
        external_ref_id: refId,
        item_type: 'bug',
        title: summaryTitle,
        description,
        status: 'not_started',
        metadata: {
          ci_job: input.jobName,
          commit_hash: input.commitSha,
          pr_number: input.prNumber || null,
          failing_file: input.failingFilePath || null,
          agent_prompt: agentPrompt,
          priority: 'Critical',
          severity: 'High',
          auto_generated: true,
          reported_at: new Date().toISOString(),
        },
      },
    ],
  };
}

/**
 * Dispatches CI failure payload to SunShade Tracker ingestion endpoint.
 */
export async function reportCiFailure(input: CiFailureInput): Promise<any> {
  const payload = constructCiFailurePayload(input);
  const baseUrl = (input.trackerUrl || process.env.SUNSHADE_TRACKER_URL || 'https://track.sunshade.icu').replace(/\/$/, '');
  const token =
    input.trackerToken !== undefined
      ? input.trackerToken
      : process.env.SUNSHADE_TRACKER_TOKEN || process.env.SUNSHADE_API_KEY || '';

  if (!token) {
    throw new Error('SUNSHADE_TRACKER_TOKEN is required to report CI failures.');
  }

  const res = await globalThis.fetch(`${baseUrl}/api/v1/items/ingest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Tracker Ingestion failed [HTTP ${res.status}]: ${errorText}`);
  }

  return await res.json();
}
