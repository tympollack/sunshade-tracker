import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { BoardColumn } from '@/components/board/BoardColumn';
import { BoardView } from '@/components/board/BoardView';
import { StatusDefinition } from '@/types/tracker';
import fs from 'fs';
import path from 'path';

describe('TASK-TRK-COLUMN-SCROLL-VIEWPORT-LOCK: Viewport Height Lock & Independent Column Scrolling', () => {
  const mockStatus: StatusDefinition = {
    id: 'in_progress',
    label: 'In Progress',
    color: '#3b82f6',
    order: 2,
  };

  describe('Board Stage Viewport Lock', () => {
    it('BoardView applies 100dvh viewport height lock classes with overflow-y-hidden', () => {
      render(
        <BoardView dataTestId="test-board-view">
          <div>Column 1</div>
        </BoardView>
      );

      const board = screen.getByTestId('test-board-view');
      expect(board.className).toContain('h-[calc(100dvh-var(--header-height)-var(--toolbar-height))]');
      expect(board.className).toContain('w-full');
      expect(board.className).toContain('overflow-x-auto');
      expect(board.className).toContain('overflow-y-hidden');
      expect(board.className).toContain('flex');
      expect(board.className).toContain('gap-4');
      expect(board.className).toContain('p-4');
    });

    it('BoardView omits viewport height lock and vertical clipping when orientation is stack', () => {
      render(
        <BoardView orientation="stack" dataTestId="test-board-stack-view">
          <div>Column 1</div>
        </BoardView>
      );

      const board = screen.getByTestId('test-board-stack-view');
      expect(board.className).toContain('h-auto');
      expect(board.className).toContain('overflow-y-visible');
      expect(board.className).toContain('flex-col');
      expect(board.className).not.toContain('overflow-y-hidden');
      expect(board.className).not.toContain('h-[calc(100dvh-var(--header-height)-var(--toolbar-height))]');
    });

    it('BoardViewContainer source code contains board stage lock classes and globals.css defines header/toolbar heights', () => {
      const containerPath = path.resolve('src/components/views/BoardViewContainer.tsx');
      const content = fs.readFileSync(containerPath, 'utf8');
      expect(content).toContain('h-[calc(100dvh-var(--header-height)-var(--toolbar-height))]');
      expect(content).toContain('overflow-y-hidden');

      const cssPath = path.resolve('src/app/globals.css');
      const css = fs.readFileSync(cssPath, 'utf8');
      expect(css).toContain('--header-height: 56px;');
      expect(css).toContain('--toolbar-height: 48px;');
    });
  });

  describe('Column Geometry and Sticky Column Header', () => {
    it('BoardColumn enforces w-full min-w-0 on mobile and md:min-w-[280px] md:max-w-[340px] flex-1 flex flex-col h-full bg-slate-950/50 on desktop', () => {
      render(
        <BoardColumn column={mockStatus} itemCount={5}>
          <div data-testid="card-slot">Card Content</div>
        </BoardColumn>
      );

      const col = screen.getByTestId('board-column-in_progress');
      expect(col.className).toContain('w-full');
      expect(col.className).toContain('min-w-0');
      expect(col.className).toContain('md:min-w-[280px]');
      expect(col.className).toContain('md:max-w-[340px]');
      expect(col.className).toContain('flex-1');
      expect(col.className).toContain('flex-col');
      expect(col.className).toContain('h-full');
      expect(col.className).toContain('bg-slate-950/50');
      expect(col.className).toContain('border-slate-800/80');
      expect(col.className).toContain('rounded-xl');
    });

    it('renders sticky column header with status dot, title, count pill and collapse toggle', () => {
      render(
        <BoardColumn column={mockStatus} itemCount={7} onToggleCollapse={() => {}}>
          <div>Cards</div>
        </BoardColumn>
      );

      const header = screen.getByText('In Progress').closest('div.sticky');
      expect(header).not.toBeNull();
      expect(header?.className).toContain('shrink-0');
      expect(header?.className).toContain('p-3');
      expect(header?.className).toContain('border-b');
      expect(header?.className).toContain('border-slate-800');
      expect(header?.className).toContain('bg-slate-900/90');
      expect(header?.className).toContain('backdrop-blur');
      expect(header?.className).toContain('sticky');
      expect(header?.className).toContain('top-0');
      expect(header?.className).toContain('z-10');
      expect(header?.className).toContain('rounded-t-xl');

      // Item count pill
      expect(screen.getByText('7')).toBeInTheDocument();
      // Collapse toggle
      expect(screen.getByTestId('column-collapse-toggle-in_progress')).toBeInTheDocument();
    });
  });

  describe('Independent Card Container Scroll', () => {
    it('card container scroll container has flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2.5 custom-scrollbar min-h-0', () => {
      render(
        <BoardColumn column={mockStatus} itemCount={3}>
          <div data-testid="card-1">Card 1</div>
          <div data-testid="card-2">Card 2</div>
        </BoardColumn>
      );

      const card = screen.getByTestId('card-1');
      const scrollParent = card.parentElement;
      expect(scrollParent).not.toBeNull();
      expect(scrollParent?.className).toContain('flex-1');
      expect(scrollParent?.className).toContain('overflow-y-auto');
      expect(scrollParent?.className).toContain('overflow-x-hidden');
      expect(scrollParent?.className).toContain('p-2');
      expect(scrollParent?.className).toContain('space-y-2.5');
      expect(scrollParent?.className).toContain('custom-scrollbar');
      expect(scrollParent?.className).toContain('min-h-0');
    });

    it('BoardViewContainer mounts BoardColumn which enforces sticky header and independent column scroll classes', () => {
      const containerPath = path.resolve('src/components/views/BoardViewContainer.tsx');
      const containerContent = fs.readFileSync(containerPath, 'utf8');
      expect(containerContent).toContain('<BoardColumn');

      const columnPath = path.resolve('src/components/board/BoardColumn.tsx');
      const content = fs.readFileSync(columnPath, 'utf8');
      expect(content).toContain('sticky top-0 z-10');
      expect(content).toContain('min-w-[280px]');
      expect(content).toContain('max-w-[340px]');
      expect(content).toContain('md:overflow-y-auto');
      expect(content).toContain('overflow-x-hidden');
    });
  });
});
