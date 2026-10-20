import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { TrackerServerOptions, createTrackerMcpServer } from './server';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Starts the MCP server using stdio transport for local agent CLI integrations
 * (e.g. Claude Desktop, Cursor, Antigravity, Windsurf).
 */
export async function startStdioServer(
  options: TrackerServerOptions = {},
  existingServer?: Server
): Promise<{ server: Server; transport: StdioServerTransport }> {
  const server = existingServer || createTrackerMcpServer(options);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  return { server, transport };
}

/**
 * Handles incoming SSE connections for remote web agent integrations.
 */
export async function handleSseConnection(
  req: IncomingMessage,
  res: ServerResponse,
  endpointPath = '/sse',
  options: TrackerServerOptions = {}
): Promise<{ server: Server; transport: SSEServerTransport }> {
  const server = createTrackerMcpServer(options);
  const transport = new SSEServerTransport(endpointPath, res);

  await server.connect(transport);
  return { server, transport };
}
