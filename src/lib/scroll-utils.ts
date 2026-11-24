/**
 * Resolves the active vertical scroll container for a DOM element.
 * Walks ancestors looking for a scrollable element (`overflow-y: auto | scroll | overlay`)
 * that actually overflows vertically, falling back to known container markers or
 * `document.scrollingElement` in synthetic test environments.
 */
export function findScrollableVerticalAncestor(el: HTMLElement | null): HTMLElement | null {
  if (!el || typeof window === 'undefined') return null;

  let cur: HTMLElement | null = el.parentElement;
  let firstOverflowCandidate: HTMLElement | null = null;

  while (cur) {
    const style = window.getComputedStyle(cur);
    const overflowY = style.overflowY;
    const isScrollableStyle =
      overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';

    if (isScrollableStyle) {
      if (!firstOverflowCandidate) {
        firstOverflowCandidate = cur;
      }
      if (cur.scrollHeight > cur.clientHeight + 1) {
        return cur;
      }
    }
    cur = cur.parentElement;
  }

  return (
    firstOverflowCandidate ||
    (el.closest('[data-testid="tree-scroll-container"]') as HTMLElement | null) ||
    (document.scrollingElement as HTMLElement | null)
  );
}
