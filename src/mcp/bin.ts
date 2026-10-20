#!/usr/bin/env node
import { startStdioServer } from './transports';

async function main() {
  try {
    await startStdioServer();
    // Keep process alive for stdio transport
    process.stdin.resume();
  } catch (err: any) {
    console.error('Fatal MCP Server startup error:', err?.message || err);
    process.exit(1);
  }
}

main();
