import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('BUG-TRK-BOARD-SCROLL, TASK-TRK-BOARD-RESPONSIVE-LAYOUT, and TASK-TRK-BOARD-MOBILE-SCROLLBARS', () => {
  const pagePath = path.resolve('src/app/(dashboard)/[tenantSlug]/[projectSlug]/page.tsx');
  const cssPath = path.resolve('src/app/globals.css');
  const pageContent = fs.readFileSync(pagePath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  describe('BUG-TRK-BOARD-SCROLL: Viewport-Adaptive Height and Wheel Translation', () => {
    it('uses viewport-adaptive height for standard board mode instead of rigid 620px', () => {
      // Standard board height must adapt to viewport height so horizontal scrollbar stays above the fold
      expect(pageContent).toContain('md:h-[calc(100vh-270px)]');
      expect(pageContent).toContain('md:min-h-[420px]');
      expect(pageContent).not.toContain(": 'h-[620px]'");
    });

    it('attaches wheel listener on board container for horizontal canvas translation', () => {
      expect(pageContent).toContain('onWheel={handleBoardWheel}');
      expect(pageContent).toContain('ref={boardScrollRef}');
      expect(pageContent).toContain('handleBoardWheel');
      expect(pageContent).toContain('boardScrollRef.current.scrollLeft += e.deltaY');
    });

    it('relaxes overscroll containment from board-scroll-container in globals.css', () => {
      // board-scroll-container must not have overscroll-behavior: contain which traps vertical wheel scrolling
      expect(cssContent).not.toMatch(/\.board-scroll-container\s*,\s*[^}]*overscroll-behavior:\s*contain/);
      expect(cssContent).toContain('.board-column-scroll');
      expect(cssContent).toContain('overscroll-behavior-y: auto');
    });
  });

  describe('TASK-TRK-BOARD-RESPONSIVE-LAYOUT: Narrow Viewport Responsive Stacking', () => {
    it('applies flex-col on mobile and flex-row on desktop for board columns container', () => {
      expect(pageContent).toContain('flex flex-col md:flex-row');
    });

    it('sets full width for columns on mobile and fixed 80 / 320px on desktop', () => {
      expect(pageContent).toContain('w-full md:w-80 md:min-w-[320px] md:max-w-[320px]');
    });

    it('renders accordion toggle for collapsing/expanding columns upward', () => {
      expect(pageContent).toContain('toggleCollapseUp');
      expect(pageContent).toContain('title="Collapse column upward"');
    });
  });

  describe('TASK-TRK-BOARD-MOBILE-SCROLLBARS: Clean Single-Axis Mobile Scrolling', () => {
    it('disables nested column vertical scrollbars on mobile to prevent double scrollbars', () => {
      expect(pageContent).toContain('overflow-y-visible max-h-none md:overflow-y-auto md:max-h-full');
    });

    it('sets board-scroll-container to h-auto and overflow-x-hidden on mobile in Tailwind and CSS', () => {
      expect(pageContent).toContain('overflow-x-hidden md:overflow-x-auto');
      expect(pageContent).toContain('h-auto md:h-');
      expect(cssContent).toContain('@media (max-width: 767px)');
      expect(cssContent).toContain('overflow-x: hidden !important');
      expect(cssContent).toContain('max-height: none !important');
    });
  });
});
