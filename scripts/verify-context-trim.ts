/**
 * Context Window & Customization Token Verification Script
 * Validates that workspace rules and customization files remain lightweight
 * and well below the 1,000 token limit to prevent context bloat and path pointer demotion.
 */

import * as fs from 'fs';
import * as path from 'path';

function estimateTokens(text: string): number {
  // Conservative heuristic: ~4 characters per token for technical English / markdown
  return Math.ceil(text.length / 4);
}

export function auditWorkspaceContextTokens(): {
  files: { path: string; bytes: number; estimatedTokens: number }[];
  totalTokens: number;
  threshold: number;
  passed: boolean;
} {
  const root = process.cwd();
  const ruleFiles = [
    path.join(root, '.antigravityrules'),
    path.join(process.env.USERPROFILE || 'C:\\Users\\Tymz', '.gemini', 'GEMINI.md'),
  ];

  const results: { path: string; bytes: number; estimatedTokens: number }[] = [];
  let totalTokens = 0;

  for (const filePath of ruleFiles) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const tokens = estimateTokens(content);
      totalTokens += tokens;
      results.push({
        path: path.basename(filePath),
        bytes: Buffer.byteLength(content, 'utf8'),
        estimatedTokens: tokens,
      });
      console.log(`[Context Audit] ${path.basename(filePath)}: ${content.length} chars (~${tokens} tokens)`);
    } else {
      console.log(`[Context Audit] Optional rule file not found: ${filePath}`);
    }
  }

  const threshold = 1000; // Strict customization headroom threshold (< 1,000 tokens)
  const passed = totalTokens < threshold;

  console.log(`[Context Audit] Total Customization Tokens: ${totalTokens} (Threshold: < ${threshold})`);
  console.log(`[Context Audit] Status: ${passed ? '✅ PASSED (Optimal Headroom)' : '❌ FAILED (Exceeds Threshold)'}`);

  return {
    files: results,
    totalTokens,
    threshold,
    passed,
  };
}

if (process.argv[1]?.endsWith('verify-context-trim.ts')) {
  const res = auditWorkspaceContextTokens();
  process.exit(res.passed ? 0 : 1);
}
