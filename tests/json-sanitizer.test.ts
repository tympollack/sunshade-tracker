import { describe, it, expect } from 'vitest';
import {
  sanitizeJsonString,
  computePositionFromLineCol,
  computeLineColFromPosition,
  generateContextSnippet,
  extractErrorDiagnostics,
  parseResilientJson,
  extractRawTitle,
  buildRawCardPayload,
} from '@/lib/jsonSanitizer';

describe('TASK-TRK-INGEST-ESCAPE-NORMALIZER: jsonSanitizer utility', () => {
  describe('sanitizeJsonString', () => {
    it('leaves valid JSON untouched', () => {
      const valid = JSON.stringify({
        project_slug: 'core-app',
        message: 'Hello world',
        count: 42,
        escaped: 'Quote: \" and backslash: \\ and newline: \n',
        unicode: 'Check: \u0041',
      });
      expect(sanitizeJsonString(valid)).toBe(valid);
      expect(JSON.parse(sanitizeJsonString(valid))).toEqual(JSON.parse(valid));
    });

    it('normalizes smart curly double and single quotes into standard quotes', () => {
      const raw = '{\n  “title”: “Deploy Feature”, \n  ‘key’: ‘value’\n}';
      const sanitized = sanitizeJsonString(raw);
      expect(sanitized).toContain('"title": "Deploy Feature"');
      expect(sanitized).toContain("'key': 'value'");
    });

    it('sanitizes invalid escape characters like \\w, \\s, \\d, \\$ and unescaped Windows paths', () => {
      const raw = '{"regex": "\\w+", "path": "renders\\${userId}\\image.webp", "win": "C:\\Users\\Tymz"}';
      const sanitized = sanitizeJsonString(raw);
      expect(sanitized).toContain('\\\\w+');
      expect(sanitized).toContain('\\\\${userId}');
      expect(sanitized).toContain('\\\\image.webp');
      expect(sanitized).toContain('C:\\\\Users\\\\Tymz');

      // Now standard JSON.parse must succeed
      const parsed = JSON.parse(sanitized);
      expect(parsed.regex).toBe('\\w+');
      expect(parsed.win).toBe('C:\\Users\\Tymz');
    });

    it('preserves valid JSON escapes while normalizing adjacent invalid escapes', () => {
      // In input: \n is valid newline escape, \w is invalid escape
      const raw = '{"text": "Line 1\\nLine 2 with \\w+"}';
      const sanitized = sanitizeJsonString(raw);
      expect(sanitized).toContain('\\n');
      expect(sanitized).toContain('\\\\w+');
      const parsed = JSON.parse(sanitized);
      expect(parsed.text).toBe('Line 1\nLine 2 with \\w+');
    });

    it('handles unicode escape validations: keeps valid 4-hex and escapes incomplete', () => {
      const validUnicode = '{"uni": "\\u0041"}';
      expect(sanitizeJsonString(validUnicode)).toBe(validUnicode);

      const invalidUnicode = '{"uni": "\\u12"}';
      const sanitized = sanitizeJsonString(invalidUnicode);
      expect(sanitized).toBe('{"uni": "\\\\u12"}');
    });

    it('handles empty string or non-string input gracefully', () => {
      expect(sanitizeJsonString('')).toBe('');
      expect(sanitizeJsonString(null as any)).toBe('');
      expect(sanitizeJsonString(undefined as any)).toBe('');
    });
  });

  describe('parseResilientJson', () => {
    it('tier 1: parses standard valid JSON cleanly', () => {
      const input = '{"project_slug": "demo", "items": [{"title": "Test"}]}';
      const result = parseResilientJson(input);
      expect(result.success).toBe(true);
      expect(result.method).toBe('standard');
      expect(result.data.project_slug).toBe('demo');
    });

    it('tier 2: parses unescaped backslashes via sanitized pre-flight', () => {
      const input = '{"path": "renders\\${userId}\\file.webp", "regex": "\\w+"}';
      const result = parseResilientJson(input);
      expect(result.success).toBe(true);
      expect(result.method).toBe('sanitized');
      expect(result.sanitizedText).toBeDefined();
      expect(result.data.regex).toBe('\\w+');
    });

    it('tier 3: parses relaxed JSON (single quotes, trailing commas, unquoted keys) via JSON5', () => {
      const input = `{
        project_slug: 'demo-proj',
        items: [
          { title: 'Relaxed card', },
        ],
      }`;
      const result = parseResilientJson(input);
      expect(result.success).toBe(true);
      expect(result.method).toBe('json5');
      expect(result.data.project_slug).toBe('demo-proj');
      expect(result.data.items[0].title).toBe('Relaxed card');
    });

    it('tier 4: parses relaxed JSON containing unescaped backslashes via JSON5 + sanitizer', () => {
      const input = `{
        project_slug: 'demo-proj',
        path: 'C:\\projects\\new-dir',
      }`;
      const result = parseResilientJson(input);
      expect(result.success).toBe(true);
      expect(result.method === 'json5' || result.method === 'json5_sanitized').toBe(true);
      expect(result.data.project_slug).toBe('demo-proj');
    });

    it('returns diagnostics when all tiers fail on unstructured text', () => {
      const input = 'Here are my meeting notes:\n- item 1\n- item 2';
      const result = parseResilientJson(input);
      expect(result.success).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.line).toBeGreaterThanOrEqual(1);
      expect(result.diagnostics?.column).toBeGreaterThanOrEqual(1);
      expect(result.diagnostics?.snippet).toBeDefined();
    });
  });

  describe('TASK-TRK-INGEST-ERROR-LOCATOR: Error diagnostics and snippets', () => {
    it('computes position, line, and column accurately', () => {
      const text = 'line 1\nline 2 is longer\nline 3';
      // line 2, col 6 is '2'
      const pos = computePositionFromLineCol(text, 2, 6);
      expect(pos).toBe(7 + 5); // 7 for "line 1\n" + 5 chars for "line "
      const { line, column } = computeLineColFromPosition(text, pos);
      expect(line).toBe(2);
      expect(column).toBe(6);
    });

    it('generates 2-line before and 2-line after contextual snippet with cursor pointer marker', () => {
      const text = [
        'line 1',
        'line 2',
        'line 3 target here',
        'line 4',
        'line 5',
        'line 6',
      ].join('\n');

      const snippet = generateContextSnippet(text, 3, 8);
      expect(snippet).toContain('1 | line 1');
      expect(snippet).toContain('2 | line 2');
      expect(snippet).toContain('3 | line 3 target here');
      expect(snippet).toContain('^');
      expect(snippet).toContain('4 | line 4');
      expect(snippet).toContain('5 | line 5');
      // Should not contain line 6 (only 2 lines after)
      expect(snippet).not.toContain('6 | line 6');
    });

    it('extracts line and column from Node/V8 and JSON5 error messages', () => {
      const v8Error = 'Bad escaped character in JSON at position 16399 (line 205 column 824)';
      const diag1 = extractErrorDiagnostics(v8Error);
      expect(diag1.line).toBe(205);
      expect(diag1.column).toBe(824);
      expect(diag1.position).toBe(16399);

      const json5Error = 'JSON5: invalid character at 12:34';
      const diag2 = extractErrorDiagnostics(json5Error);
      expect(diag2.line).toBe(12);
      expect(diag2.column).toBe(34);

      const posOnlyError = 'Unexpected token } in JSON at position 7';
      const sampleText = '{\n  "a":\n}';
      const diag3 = extractErrorDiagnostics(posOnlyError, sampleText);
      expect(diag3.position).toBe(7);
      expect(diag3.line).toBe(2);
      expect(diag3.column).toBe(6);
      expect(diag3.snippet).toBeDefined();
    });
  });

  describe('TASK-TRK-INGEST-ACCEPT-AS-IS: Raw card fallback helpers', () => {
    it('extractRawTitle extracts first line truncated to 80 chars', () => {
      expect(extractRawTitle('First Line Summary\nSecond line details')).toBe('First Line Summary');
      expect(extractRawTitle('')).toBe('Raw Ingestion Note');
      expect(extractRawTitle('   \n  \n')).toBe('Raw Ingestion Note');

      const longLine = 'A'.repeat(120);
      expect(extractRawTitle(longLine)).toBe('A'.repeat(80));
    });

    it('buildRawCardPayload creates a valid single-task ingest payload with metadata.raw_payload', () => {
      const rawText = 'Meeting notes: investigate bug in ingestion modal';
      const payload = buildRawCardPayload(rawText, 'tracker-web', {
        overrideProject: 'tracker-core',
        overrideSprint: 'sprint-2026-q4',
        overrideAssignee: 'tympollack',
      });

      expect(payload.project_slug).toBe('tracker-core');
      expect(payload.override_project_slug).toBe('tracker-core');
      expect(payload.override_sprint).toBe('sprint-2026-q4');
      expect(payload.override_assignee).toBe('tympollack');
      expect(payload.items).toHaveLength(1);

      const item = payload.items[0];
      expect(item.external_ref_id).toMatch(/^RAW-INGEST-\d+$/);
      expect(item.title).toBe('Meeting notes: investigate bug in ingestion modal');
      expect(item.description).toBe(rawText);
      expect(item.item_type).toBe('task');
      expect(item.status).toBe('not_started');
      expect(item.metadata.source_type).toBe('raw_manual_ingest');
      expect(item.metadata.raw_payload).toBe(rawText);
    });
  });
});
