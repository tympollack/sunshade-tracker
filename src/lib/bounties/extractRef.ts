const STANDARD_PREFIX_PATTERN = /\b((?:TASK|BUG|STORY|EPIC|FEAT|EVT|SUBTASK|PRD|RFC|TRK|PW|VAL)-[A-Za-z0-9_-]+)\b/i;
const BRACKETED_REF_PATTERN = /\[([A-Za-z0-9_]+-[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*)\]/i;
const GENERAL_REF_PATTERN = /\b([A-Z]{2,8}-\d+(?:-[A-Za-z0-9_]+)*)\b/i;

export function extractTaskRefId(texts: Array<string | null | undefined>): string | null {
  for (const text of texts) {
    if (!text) continue;

    // 1. Bracketed ref: [TASK-101]
    const bracketMatch = text.match(BRACKETED_REF_PATTERN);
    if (bracketMatch && !/^patch-\d+$/i.test(bracketMatch[1])) {
      return bracketMatch[1].toUpperCase();
    }

    // 2. Known ecosystem prefix: TASK-*, BUG-*, STORY-*, etc.
    const standardMatch = text.match(STANDARD_PREFIX_PATTERN);
    if (standardMatch) {
      return standardMatch[1].toUpperCase();
    }

    // 3. General uppercase prefix with number (e.g. PROJ-101)
    const generalMatch = text.match(GENERAL_REF_PATTERN);
    if (generalMatch && !/^patch-\d+$/i.test(generalMatch[1])) {
      return generalMatch[1].toUpperCase();
    }
  }
  return null;
}
