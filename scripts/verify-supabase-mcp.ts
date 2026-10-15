/**
 * Supabase Model Context Protocol (MCP) Verification Script
 * Validates tool discovery (database, get_advisors, search_docs) and runs smoke
 * test queries against tracker, public, and isolated application schemas via JSON-RPC.
 */

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface ToolsListResult {
  tools: McpTool[];
}

interface ToolCallResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

const REQUIRED_TOOLS = ['database', 'get_advisors', 'search_docs'];
const TARGET_SCHEMAS = ['tracker', 'cozy', 'valerie', 'patchwork', 'wsw', 'public'];

async function sendJsonRpc<T>(
  url: string,
  request: JsonRpcRequest,
  token?: string
): Promise<JsonRpcResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return (await res.json()) as JsonRpcResponse<T>;
}

export async function verifySupabaseMcp(): Promise<{ success: boolean; mode: 'live' | 'synthetic'; tools: string[] }> {
  const isSyntheticMode = process.argv.includes('--synthetic') || process.env.MCP_SYNTHETIC_TEST === 'true';
  const projectRef = process.env.SUPABASE_PROJECT_REF || 'rweehbzsflhhtwjrjnvy';
  const pat = process.env.SUPABASE_PERSONAL_ACCESS_TOKEN;
  const localUrl = process.env.SUPABASE_MCP_LOCAL_URL || 'http://localhost:54321/mcp';
  const remoteUrl = `https://mcp.supabase.com/mcp?project_ref=${projectRef}`;

  const targetUrl = pat ? remoteUrl : localUrl;
  console.log(`[MCP Verify] Mode: ${isSyntheticMode ? 'Synthetic Protocol Offline' : 'Live Server Verification'}`);
  console.log(`[MCP Verify] Target Endpoint: ${targetUrl.replace(/project_ref=.*/, 'project_ref=***')}`);

  if (isSyntheticMode) {
    // Explicit Synthetic Protocol Self-Test
    console.log('[MCP Verify] Executing synthetic offline protocol validation...');

    const mockToolDefinitions: McpTool[] = [
      {
        name: 'database',
        description: 'Execute SQL queries and introspect database schemas across SunShade platforms',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
      {
        name: 'get_advisors',
        description: 'Run Supabase database security and performance advisor checks',
        inputSchema: {
          type: 'object',
          properties: { type: { type: 'string', enum: ['security', 'performance'] } },
        },
      },
      {
        name: 'search_docs',
        description: 'Search official Supabase platform documentation and guides',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ];

    const discoveredTools = mockToolDefinitions.map((t) => t.name);

    for (const required of REQUIRED_TOOLS) {
      if (!discoveredTools.includes(required)) {
        throw new Error(`Synthetic verification failed: missing tool "${required}"`);
      }
    }

    const introspectionQuery = `
      SELECT table_schema, count(*) as table_count
      FROM information_schema.tables
      WHERE table_schema IN (${TARGET_SCHEMAS.map((s) => `'${s}'`).join(', ')})
      GROUP BY table_schema;
    `.trim();

    if (!TARGET_SCHEMAS.every((s) => introspectionQuery.includes(`'${s}'`))) {
      throw new Error('Synthetic query validation failed: missing isolated schema namespaces');
    }

    console.log('[MCP Verify] Synthetic protocol & schema validation passed.');
    return { success: true, mode: 'synthetic', tools: discoveredTools };
  }

  // Live Verification Path: Must connect, discover all tools, and execute smoke queries
  console.log('[MCP Verify] Probing live endpoint via tools/list...');
  let listResp: JsonRpcResponse<ToolsListResult>;
  try {
    listResp = await sendJsonRpc<ToolsListResult>(
      targetUrl,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      },
      pat
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Live MCP server unreachable at ${targetUrl}: ${errorMsg}. Start local Supabase CLI or supply valid SUPABASE_PERSONAL_ACCESS_TOKEN.`);
  }

  if (listResp.error) {
    throw new Error(`JSON-RPC error during tools/list: ${listResp.error.message} (code ${listResp.error.code})`);
  }

  const discoveredTools = listResp.result?.tools?.map((t) => t.name) || [];
  console.log(`[MCP Verify] Live tools discovered: ${discoveredTools.join(', ')}`);

  // Assert all required tools are present (failing verification if any tool is absent)
  for (const required of REQUIRED_TOOLS) {
    if (!discoveredTools.some((t) => t.toLowerCase().includes(required))) {
      throw new Error(`Live verification failed: Required tool "${required}" not found in MCP server tools/list`);
    }
  }

  // Execute smoke query covering ALL isolated application schemas
  console.log(`[MCP Verify] Executing smoke query against isolated schemas: ${TARGET_SCHEMAS.join(', ')}...`);
  const smokeQuery = `
    SELECT table_schema, count(*) as table_count
    FROM information_schema.tables
    WHERE table_schema IN (${TARGET_SCHEMAS.map((s) => `'${s}'`).join(', ')})
    GROUP BY table_schema
    ORDER BY table_schema;
  `.trim();

  const callResp = await sendJsonRpc<ToolCallResult>(
    targetUrl,
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'database',
        arguments: { query: smokeQuery },
      },
    },
    pat
  );

  // Assert neither JSON-RPC error nor tool-level isError
  if (callResp.error) {
    throw new Error(`JSON-RPC error executing smoke query: ${callResp.error.message} (code ${callResp.error.code})`);
  }

  if (callResp.result?.isError) {
    const errDetail = callResp.result.content?.map((c) => c.text).join('\n') || 'Unknown tool execution error';
    throw new Error(`Database tool execution failed (isError=true): ${errDetail}`);
  }

  if (!callResp.result) {
    throw new Error('Database tool returned empty result payload');
  }

  console.log('[MCP Verify] Query Response:', JSON.stringify(callResp.result, null, 2));
  console.log('[MCP Verify] ✅ Live verification completed successfully.');
  return {
    success: true,
    mode: 'live',
    tools: discoveredTools,
  };
}

if (process.argv[1]?.endsWith('verify-supabase-mcp.ts')) {
  verifySupabaseMcp()
    .then((res) => {
      console.log(`[MCP Verify] Result: ${JSON.stringify(res)}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[MCP Verify] ❌ Verification failed:', err.message || err);
      process.exit(1);
    });
}
