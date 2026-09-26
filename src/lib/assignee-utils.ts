/**
 * Assignee Normalization & Display Helpers (TRK-19)
 * Standardizes assignee mutations to always use the canonical name/handle ('Tymz'),
 * while using '<Name> (You)' solely for display formatting in selector dropdowns.
 */

/**
 * Normalizes an assignee string to its canonical form:
 * - 'Me (Tymz)' -> 'Tymz'
 * - 'Tymz (You)' -> 'Tymz'
 * - 'Tymz (Me)' -> 'Tymz'
 * - '__unassigned__' -> null
 * - '' -> null
 */
export function normalizeAssignee(val: string | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  const trimmed = String(val).trim();
  if (!trimmed || trimmed === '__unassigned__') return null;

  // Pattern: 'Me (Tymz)'
  const mePrefixMatch = trimmed.match(/^Me\s*\(([^)]+)\)$/i);
  if (mePrefixMatch && mePrefixMatch[1]) {
    const inner = mePrefixMatch[1].trim();
    if (inner) return inner;
  }

  // Pattern: 'Tymz (You)' or 'Tymz (Me)'
  const suffixMatch = trimmed.match(/^(.+?)\s*\((?:You|Me)\)$/i);
  if (suffixMatch && suffixMatch[1]) {
    const inner = suffixMatch[1].trim();
    if (inner) return inner;
  }

  return trimmed;
}

/**
 * Formats an assignee for selector dropdown displays.
 * If the assignee matches the current user's name/handle, displays '<Name> (You)'.
 */
export function formatAssigneeDisplay(
  assignee: string | null | undefined,
  currentUserHandle?: string | null
): string {
  const canonical = normalizeAssignee(assignee);
  if (!canonical) return 'Unassigned';

  const userHandle = normalizeAssignee(currentUserHandle);
  if (userHandle && canonical.toLowerCase() === userHandle.toLowerCase()) {
    return `${canonical} (You)`;
  }

  return canonical;
}
