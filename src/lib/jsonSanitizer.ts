import JSON5 from 'json5';

export interface IngestErrorDiagnostics {
  line: number;
  column: number;
  position: number;
  message: string;
  snippet?: string;
}

export interface ResilientParseResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  method?: 'standard' | 'sanitized' | 'json5' | 'json5_sanitized';
  sanitizedText?: string;
  diagnostics?: IngestErrorDiagnostics;
}

/**
 * Normalizes smart quotes and invalid JSON escapes.
 * Replaces any backslash not followed by valid JSON escape chars (\", \\, /, b, f, n, r, t, u[0-9a-fA-F]{4})
 * with double backslashes (\\\\).
 */
export function sanitizeJsonString(raw: string): string {
  if (typeof raw !== 'string') return '';

  // 1. Normalize smart quotes (curly double quotes and single quotes)
  const quoteNormalized = raw
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  // 2. Normalize invalid JSON escape sequences
  let result = '';
  let i = 0;
  const len = quoteNormalized.length;

  while (i < len) {
    const char = quoteNormalized[i];
    if (char === '\\') {
      if (i + 1 >= len) {
        // Trailing backslash at end of string
        result += '\\\\';
        i++;
        continue;
      }

      const next = quoteNormalized[i + 1];

      // Check valid JSON escape chars: ", \, /, b, f, n, r, t
      if (
        next === '"' ||
        next === '\\' ||
        next === '/' ||
        next === 'b' ||
        next === 'f' ||
        next === 'n' ||
        next === 'r' ||
        next === 't'
      ) {
        result += '\\' + next;
        i += 2;
        continue;
      }

      // Check \uXXXX (4 hex digits)
      if (next === 'u') {
        const hex = quoteNormalized.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += '\\u' + hex;
          i += 6;
          continue;
        }
      }

      // Invalid escape character: escape the backslash
      result += '\\\\';
      i++;
    } else {
      result += char;
      i++;
    }
  }

  return result;
}

/**
 * Normalizes smart quotes and invalid JSON5 escapes.
 * Preserves all valid JSON5 escape sequences (\', \", \\, \/, \b, \f, \n, \r, \t, \v, \0, \xHH, \uHHHH, line continuations)
 * and escapes backslashes before characters that would otherwise be silently swallowed by JSON5 (e.g. \w, \s, \d, \P, \U).
 */
export function sanitizeJson5String(raw: string): string {
  if (typeof raw !== 'string') return '';

  // 1. Normalize smart quotes (curly double quotes and single quotes)
  const quoteNormalized = raw
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  // 2. Normalize invalid JSON5 escape sequences
  let result = '';
  let i = 0;
  const len = quoteNormalized.length;

  while (i < len) {
    const char = quoteNormalized[i];
    if (char === '\\') {
      if (i + 1 >= len) {
        // Trailing backslash at end of string
        result += '\\\\';
        i++;
        continue;
      }

      const next = quoteNormalized[i + 1];

      // Check valid single-character JSON5 escapes: ", ', \, /, b, f, n, r, t, v
      if (
        next === '"' ||
        next === "'" ||
        next === '\\' ||
        next === '/' ||
        next === 'b' ||
        next === 'f' ||
        next === 'n' ||
        next === 'r' ||
        next === 't' ||
        next === 'v'
      ) {
        result += '\\' + next;
        i += 2;
        continue;
      }

      // Check \0 (null character, must not be followed by a digit)
      if (next === '0') {
        const nextNext = i + 2 < len ? quoteNormalized[i + 2] : '';
        if (!/^[0-9]$/.test(nextNext)) {
          result += '\\0';
          i += 2;
          continue;
        }
      }

      // Check \xXX (2 hex digits)
      if (next === 'x') {
        const hex = quoteNormalized.slice(i + 2, i + 4);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          result += '\\x' + hex;
          i += 4;
          continue;
        }
      }

      // Check \uXXXX (4 hex digits)
      if (next === 'u') {
        const hex = quoteNormalized.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += '\\u' + hex;
          i += 6;
          continue;
        }
      }

      // Check line continuation: \ followed by \r\n, \n, or \r
      if (next === '\r' && i + 2 < len && quoteNormalized[i + 2] === '\n') {
        result += '\\\r\n';
        i += 3;
        continue;
      }
      if (next === '\n' || next === '\r') {
        result += '\\' + next;
        i += 2;
        continue;
      }

      // Invalid escape character in JSON5 (e.g. \w, \s, \d, \P, \U, \$):
      // escape the backslash so JSON5 doesn't silently consume it
      result += '\\\\';
      i++;
    } else {
      result += char;
      i++;
    }
  }

  return result;
}

/**
 * Computes character offset (0-indexed) from 1-indexed line and column numbers.
 */
export function computePositionFromLineCol(text: string, line: number, col: number): number {
  if (!text) return 0;
  const lines = text.split('\n');
  let pos = 0;
  const targetLineIdx = Math.max(0, Math.min(line - 1, lines.length - 1));

  for (let i = 0; i < targetLineIdx; i++) {
    pos += lines[i].length + 1; // +1 for newline character
  }

  pos += Math.max(0, col - 1);
  return Math.min(pos, text.length);
}

/**
 * Computes 1-indexed line and column numbers from 0-indexed character offset.
 */
export function computeLineColFromPosition(text: string, pos: number): { line: number; column: number } {
  if (!text) return { line: 1, column: 1 };
  const clampedPos = Math.max(0, Math.min(pos, text.length));
  const before = text.slice(0, clampedPos);
  const lines = before.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

/**
 * Generates a contextual code snippet showing 2 lines before and 2 lines after the error,
 * with a marker line ('^') pointing directly at the offending column.
 */
export function generateContextSnippet(text: string, line: number, column: number): string {
  if (!text) return '';
  const lines = text.split('\n');
  const lineIdx = Math.max(0, Math.min(line - 1, lines.length - 1));
  const startIdx = Math.max(0, lineIdx - 2);
  const endIdx = Math.min(lines.length - 1, lineIdx + 2);
  const maxLineDigits = String(endIdx + 1).length;

  const resultLines: string[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const lineNum = String(i + 1).padStart(maxLineDigits, ' ');
    const prefix = `${lineNum} | `;
    resultLines.push(`${prefix}${lines[i]}`);

    if (i === lineIdx) {
      const colOffset = Math.max(0, column - 1);
      const markerLine = ' '.repeat(prefix.length + colOffset) + '^';
      resultLines.push(markerLine);
    }
  }

  return resultLines.join('\n');
}

/**
 * Extracts line, column, character position, and contextual snippet from JSON parse errors
 * or API 400 error messages.
 */
export function extractErrorDiagnostics(error: unknown, rawText?: string): IngestErrorDiagnostics {
  const msg =
    typeof error === 'string'
      ? error
      : (error as any)?.message || (error as any)?.error || String(error || 'Syntax error');

  let line: number | null = null;
  let col: number | null = null;
  let pos: number | null = null;

  // 1. Inspect explicit properties on error object (e.g. JSON5 or custom syntax errors)
  if (error && typeof error === 'object') {
    if (typeof (error as any).lineNumber === 'number') line = (error as any).lineNumber;
    if (typeof (error as any).columnNumber === 'number') col = (error as any).columnNumber;
    if (typeof (error as any).line === 'number') line = (error as any).line;
    if (typeof (error as any).column === 'number') col = (error as any).column;
  }

  // 2. Pattern: line X column Y or line X, col Y
  const lineColMatch = msg.match(/line\s+(\d+)\s*,?\s*col(?:umn)?\s*(\d+)/i);
  if (lineColMatch) {
    line = parseInt(lineColMatch[1], 10);
    col = parseInt(lineColMatch[2], 10);
  }

  // 3. Pattern: at X:Y (JSON5)
  if (line === null || col === null) {
    const atMatch = msg.match(/at\s+(\d+):(\d+)/i);
    if (atMatch) {
      line = parseInt(atMatch[1], 10);
      col = parseInt(atMatch[2], 10);
    }
  }

  // 4. Pattern: position X
  const posMatch = msg.match(/position\s+(\d+)/i);
  if (posMatch) {
    pos = parseInt(posMatch[1], 10);
  }

  const text = rawText || '';

  if (pos !== null && (line === null || col === null)) {
    const computed = computeLineColFromPosition(text, pos);
    line = computed.line;
    col = computed.column;
  } else if (pos === null && line !== null && col !== null) {
    pos = computePositionFromLineCol(text, line, col);
  } else if (pos === null && line === null && col === null) {
    pos = 0;
    line = 1;
    col = 1;
  }

  const resolvedLine = line ?? 1;
  const resolvedCol = col ?? 1;
  const resolvedPos = pos ?? 0;

  const snippet = text ? generateContextSnippet(text, resolvedLine, resolvedCol) : undefined;

  return {
    line: resolvedLine,
    column: resolvedCol,
    position: resolvedPos,
    message: msg,
    snippet,
  };
}

/**
 * Multi-tier resilient JSON parser:
 * Tier 1: Standard JSON.parse
 * Tier 2: Standard JSON.parse on sanitized string (escapes & quotes normalized)
 * Tier 3: JSON5 relaxed parser
 * Tier 4: JSON5 relaxed parser on sanitized string
 *
 * If all tiers fail, returns diagnostics with line, column, and snippet.
 */
export function parseResilientJson<T = any>(raw: string): ResilientParseResult<T> {
  if (typeof raw !== 'string' || !raw.trim()) {
    return {
      success: false,
      error: 'Empty payload provided',
      diagnostics: {
        line: 1,
        column: 1,
        position: 0,
        message: 'Empty payload provided',
      },
    };
  }

  let firstError: any = null;

  // Tier 1: Standard JSON.parse
  try {
    const data = JSON.parse(raw);
    return { success: true, data, method: 'standard' };
  } catch (err: any) {
    firstError = err;
  }

  // Tier 2: Standard JSON.parse on sanitized input
  const sanitized = sanitizeJsonString(raw);
  if (sanitized !== raw) {
    try {
      const data = JSON.parse(sanitized);
      return { success: true, data, method: 'sanitized', sanitizedText: sanitized };
    } catch {
      // Continue to Tier 3
    }
  }

  // Tier 3: JSON5 relaxed parsing on sanitized JSON5 input
  // Runs before raw JSON5 to prevent JSON5 from silently dropping unescaped backslashes (\w, \s, etc.)
  const sanitized5 = sanitizeJson5String(raw);
  if (sanitized5 !== raw) {
    try {
      const data = JSON5.parse(sanitized5);
      return { success: true, data, method: 'json5_sanitized', sanitizedText: sanitized5 };
    } catch {
      // Continue to Tier 4
    }
  }

  // Tier 4: JSON5 relaxed parsing on raw input
  try {
    const data = JSON5.parse(raw);
    return { success: true, data, method: 'json5' };
  } catch (err: any) {
    if (!firstError) firstError = err;
  }

  // All tiers failed - extract diagnostics from initial error
  const diagnostics = extractErrorDiagnostics(firstError, raw);
  return {
    success: false,
    error: firstError?.message || 'Failed to parse JSON payload',
    diagnostics,
  };
}

/**
 * Extracts first line of input truncated to 80 chars, falling back to 'Raw Ingestion Note'.
 */
export function extractRawTitle(input: string): string {
  if (!input || !input.trim()) return 'Raw Ingestion Note';
  const firstLine = input.trim().split('\n')[0].trim();
  if (!firstLine) return 'Raw Ingestion Note';
  return firstLine.length > 80 ? firstLine.slice(0, 80) : firstLine;
}

/**
 * Generates single-item payload for 'Ingest as Raw Card' fallback.
 * Uses a collision-resistant UUID and omits item_type/status so the ingest endpoint
 * can apply the destination project's schema defaults.
 */
export function buildRawCardPayload(
  rawInput: string,
  projectSlug: string,
  overrides?: {
    overrideProject?: string;
    overrideSprint?: string;
    overrideAssignee?: string;
  }
) {
  const targetSlug = overrides?.overrideProject || projectSlug;
  const title = extractRawTitle(rawInput);
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const externalRefId = `RAW-INGEST-${uuid}`;

  const body: any = {
    project_slug: targetSlug,
    items: [
      {
        external_ref_id: externalRefId,
        title,
        description: rawInput,
        metadata: {
          source_type: 'raw_manual_ingest',
          raw_payload: rawInput,
        },
      },
    ],
  };

  if (overrides?.overrideProject) {
    body.override_project_slug = overrides.overrideProject;
  }
  if (overrides?.overrideSprint) {
    body.override_sprint = overrides.overrideSprint;
  }
  if (overrides?.overrideAssignee) {
    body.override_assignee = overrides.overrideAssignee;
  }

  return body;
}
