import React, { useRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  TokenCatalogPopover,
  extractMetadataTokens,
  extractSettingsTokens,
  insertTokenAtCursor,
} from '@/components/schema/TokenCatalogPopover';
import type { ProjectSettings } from '@/types/tracker';

describe('TASK-TRK-SCHEMA-TOKEN-INTROSPECTION-CATALOG: TokenCatalogPopover', () => {
  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'story', label: 'Story', level: 1, allowed_parents: [] },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'] },
    ],
    statuses: [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'in_review', label: 'In Review', color: '#f59e0b', order: 3 },
    ],
    custom_fields: [
      'pr_url',
      { key: 'target_words', label: 'Target Word Count', type: 'number' },
      { key: 'reviewer_notes', label: 'Reviewer Notes', type: 'text' },
    ],
    workflow: {
      review_status: 'in_review',
      auto_archive_days: 30,
    },
    editorial: {
      default_weekday: 'Monday',
      cadence: 14,
    },
    github_repo: 'tympollack/sunshade-tracker',
  } as any;

  describe('extractMetadataTokens & extractSettingsTokens utilities', () => {
    it('extracts metadata tokens from string and object custom_fields', () => {
      const tokens = extractMetadataTokens(sampleSettings);
      const tokenStrings = tokens.map((t) => t.token);

      expect(tokenStrings).toContain('{{item.metadata.pr_url}}');
      expect(tokenStrings).toContain('{{item.metadata.target_words}}');
      expect(tokenStrings).toContain('{{item.metadata.reviewer_notes}}');
    });

    it('extracts settings paths from custom nested settings objects', () => {
      const tokens = extractSettingsTokens(sampleSettings);
      const tokenStrings = tokens.map((t) => t.token);

      expect(tokenStrings).toContain('{{settings.workflow.review_status}}');
      expect(tokenStrings).toContain('{{settings.workflow.auto_archive_days}}');
      expect(tokenStrings).toContain('{{settings.editorial.default_weekday}}');
      expect(tokenStrings).toContain('{{settings.editorial.cadence}}');
      expect(tokenStrings).toContain('{{settings.github_repo}}');
      expect(tokenStrings).toContain('{{settings.schema_version}}');
    });
  });

  describe('Component Rendering & Interactive Selection', () => {
    it('renders trigger button and opens popover on click', () => {
      render(<TokenCatalogPopover settings={sampleSettings} />);

      const trigger = screen.getByTestId('token-catalog-popover-trigger');
      expect(trigger).toBeInTheDocument();
      expect(screen.queryByTestId('token-catalog-popover-menu')).not.toBeInTheDocument();

      fireEvent.click(trigger);
      expect(screen.getByTestId('token-catalog-popover-menu')).toBeInTheDocument();
    });

    it('renders work item tokens, dynamic metadata, settings variables, and timestamps', () => {
      render(<TokenCatalogPopover settings={sampleSettings} />);
      fireEvent.click(screen.getByTestId('token-catalog-popover-trigger'));

      // 1. Work Item tokens
      expect(screen.getByText('{{item.id}}')).toBeInTheDocument();
      expect(screen.getByText('{{item.title}}')).toBeInTheDocument();
      expect(screen.getByText('{{item.status}}')).toBeInTheDocument();
      expect(screen.getByText('{{item.assignee}}')).toBeInTheDocument();

      // 2. Dynamic metadata tokens
      expect(screen.getByText('{{item.metadata.pr_url}}')).toBeInTheDocument();
      expect(screen.getByText('{{item.metadata.target_words}}')).toBeInTheDocument();

      // 3. Settings variables
      expect(screen.getByText('{{settings.editorial.default_weekday}}')).toBeInTheDocument();
      expect(screen.getByText('{{settings.workflow.review_status}}')).toBeInTheDocument();

      // 4. System timestamps
      expect(screen.getByText('{{NOW()}}')).toBeInTheDocument();
      expect(screen.getByText('{{TODAY}}')).toBeInTheDocument();
    });

    it('filters tokens using the search input', () => {
      render(<TokenCatalogPopover settings={sampleSettings} />);
      fireEvent.click(screen.getByTestId('token-catalog-popover-trigger'));

      const searchInput = screen.getByTestId('token-catalog-search-input');
      fireEvent.change(searchInput, { target: { value: 'target_words' } });

      expect(screen.getByText('{{item.metadata.target_words}}')).toBeInTheDocument();
      expect(screen.queryByText('{{item.title}}')).not.toBeInTheDocument();
      expect(screen.queryByText('{{NOW()}}')).not.toBeInTheDocument();
    });

    it('invokes onSelectToken when an item is clicked and inserts into target input at cursor position', () => {
      const handleSelect = vi.fn();

      function TestForm() {
        const inputRef = useRef<HTMLInputElement>(null);
        return (
          <div>
            <input
              ref={inputRef}
              data-testid="target-text-input"
              defaultValue="Hello world"
            />
            <TokenCatalogPopover
              settings={sampleSettings}
              inputRef={inputRef}
              onSelectToken={handleSelect}
            />
          </div>
        );
      }

      render(<TestForm />);
      const input = screen.getByTestId('target-text-input') as HTMLInputElement;

      // Set cursor position after "Hello " (index 6)
      input.setSelectionRange(6, 6);

      fireEvent.click(screen.getByTestId('token-catalog-popover-trigger'));

      const option = screen.getByTestId('token-option-item.title');
      fireEvent.click(option);

      expect(handleSelect).toHaveBeenCalledWith('{{item.title}}');
      expect(input.value).toBe('Hello {{item.title}}world');
    });

    it('closes popover on Escape key press', async () => {
      render(<TokenCatalogPopover settings={sampleSettings} />);
      fireEvent.click(screen.getByTestId('token-catalog-popover-trigger'));

      expect(screen.getByTestId('token-catalog-popover-menu')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByTestId('token-catalog-popover-menu')).not.toBeInTheDocument();
      });
    });
  });
});
