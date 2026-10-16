import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IngestionDialog } from '@/components/ingestion/IngestionDialog';
import { SparkViewContainer } from '@/components/views/SparkViewContainer';

describe('STORY-TRK-INGEST-RESILIENCE: IngestionDialog & SparkViewContainer', () => {
  const mockAllProjects = [
    { id: 'proj-1', slug: 'core-app', name: 'Core Application' },
    { id: 'proj-2', slug: 'docs-app', name: 'Documentation' },
  ];

  const mockWorkspaceMembers = [
    { full_name: 'Tymz', email: 'tymz@sunshade.icu' },
  ];

  const defaultProps = {
    isReadOnly: false,
    sparkOverrideProject: '',
    setSparkOverrideProject: vi.fn(),
    sparkOverrideSprint: '',
    setSparkOverrideSprint: vi.fn(),
    sparkOverrideAssignee: '',
    setSparkOverrideAssignee: vi.fn(),
    allProjects: mockAllProjects,
    projectSlug: 'core-app',
    availableSprints: ['Sprint 2026-Q4', 'Sprint 2026-Q3'],
    projectSettings: {},
    workspaceMembers: mockWorkspaceMembers,
    items: [],
    sparkPayload: '{\n  "project_slug": "core-app",\n  "items": []\n}',
    setSparkPayload: vi.fn(),
    isIngesting: false,
    handleRunSparkIngest: vi.fn(),
    ingestResponse: null,
    setIngestResponse: vi.fn(),
    ingestedAffectedItemCount: 0,
    onOpenReconciliation: vi.fn(),
    onRefresh: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TASK-TRK-INGEST-ESCAPE-NORMALIZER: Auto-Fix Escapes & Pre-Flight Sanitization', () => {
    it('renders Auto-Fix Escapes button in toolbar', () => {
      render(<IngestionDialog {...defaultProps} />);
      const btn = screen.getByTestId('auto-fix-escapes-btn');
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent('Auto-Fix Escapes');
    });

    it('clicking Auto-Fix Escapes sanitizes unescaped characters and smart quotes', () => {
      const setSparkPayload = vi.fn();
      const rawPayload = '{\n  “title”: “Fix bug”, \n  "path": "renders\\${userId}\\image.webp",\n  "regex": "\\w+"\n}';

      render(
        <IngestionDialog
          {...defaultProps}
          sparkPayload={rawPayload}
          setSparkPayload={setSparkPayload}
        />
      );

      const btn = screen.getByTestId('auto-fix-escapes-btn');
      fireEvent.click(btn);

      expect(setSparkPayload).toHaveBeenCalled();
      const sanitized = setSparkPayload.mock.calls[0][0];
      expect(sanitized).toContain('"title": "Fix bug"');
      expect(sanitized).toContain('\\\\w+');
      expect(sanitized).toContain('\\\\${userId}');

      const toast = screen.getByTestId('ingest-toast');
      expect(toast).toHaveTextContent('Auto-corrected unescaped characters');
    });

    it('clicking Auto-Fix Escapes shows info toast when payload is already clean', () => {
      const cleanPayload = '{"project_slug": "core-app"}';
      render(
        <IngestionDialog
          {...defaultProps}
          sparkPayload={cleanPayload}
        />
      );

      const btn = screen.getByTestId('auto-fix-escapes-btn');
      fireEvent.click(btn);

      const toast = screen.getByTestId('ingest-toast');
      expect(toast).toHaveTextContent('No unescaped characters detected');
    });

    it('pre-flight execute automatically sanitizes unescaped characters, notifies user, and proceeds', async () => {
      const handleRunSparkIngest = vi.fn().mockResolvedValue(undefined);
      const setSparkPayload = vi.fn();
      // Payload has invalid escape \w+
      const rawPayload = '{\n  "project_slug": "core-app",\n  "regex": "\\w+"\n}';

      render(
        <IngestionDialog
          {...defaultProps}
          sparkPayload={rawPayload}
          setSparkPayload={setSparkPayload}
          handleRunSparkIngest={handleRunSparkIngest}
        />
      );

      const executeBtn = screen.getByTestId('execute-ingestion-btn');
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(handleRunSparkIngest).toHaveBeenCalled();
      });

      // User notified of auto-correction
      expect(screen.getByTestId('ingest-toast')).toHaveTextContent('Auto-corrected unescaped characters');
      expect(setSparkPayload).toHaveBeenCalled();
      expect(handleRunSparkIngest.mock.calls[0][0]).toEqual({
        project_slug: 'core-app',
        regex: '\\w+',
      });
    });

    it('pre-flight execute falls back to JSON5 relaxed parsing for unquoted keys / single quotes', async () => {
      const handleRunSparkIngest = vi.fn().mockResolvedValue(undefined);
      const relaxedPayload = "{\n  project_slug: 'core-app',\n  items: [{ title: 'Single quoted card', },],\n}";

      render(
        <IngestionDialog
          {...defaultProps}
          sparkPayload={relaxedPayload}
          handleRunSparkIngest={handleRunSparkIngest}
        />
      );

      const executeBtn = screen.getByTestId('execute-ingestion-btn');
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(handleRunSparkIngest).toHaveBeenCalled();
      });

      expect(screen.getByTestId('ingest-toast')).toHaveTextContent('Parsed using JSON5 relaxed mode');
      expect(handleRunSparkIngest.mock.calls[0][0].project_slug).toBe('core-app');
    });
  });

  describe('TASK-TRK-INGEST-ERROR-LOCATOR: Error Locator & Editor Highlighting', () => {
    it('displays interactive syntax error banner and snippet on unparsable input', async () => {
      const unparsable = '{\n  "title": "Unclosed quote\n  "key": 123\n}';
      const setIngestResponse = vi.fn();

      render(
        <IngestionDialog
          {...defaultProps}
          sparkPayload={unparsable}
          setIngestResponse={setIngestResponse}
        />
      );

      const executeBtn = screen.getByTestId('execute-ingestion-btn');
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(screen.getByTestId('syntax-error-banner')).toBeInTheDocument();
      });

      const pill = screen.getByTestId('syntax-error-pill');
      expect(pill.textContent).toMatch(/Syntax Error at Line \d+, Col \d+/);

      const snippet = screen.getByTestId('syntax-error-snippet');
      expect(snippet).toBeInTheDocument();
      expect(snippet.textContent).toContain('^');
    });

    it('jumps cursor and focuses editor when Jump to Issue is clicked', async () => {
      const unparsable = '{\n  "invalid": }';
      render(
        <IngestionDialog
          {...defaultProps}
          sparkPayload={unparsable}
        />
      );

      const executeBtn = screen.getByTestId('execute-ingestion-btn');
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(screen.getByTestId('jump-to-issue-btn')).toBeInTheDocument();
      });

      const textarea = screen.getByTestId('spark-payload-textarea') as HTMLTextAreaElement;
      const setSelectionRangeSpy = vi.spyOn(textarea, 'setSelectionRange');
      const focusSpy = vi.spyOn(textarea, 'focus');

      const jumpBtn = screen.getByTestId('jump-to-issue-btn');
      fireEvent.click(jumpBtn);

      expect(focusSpy).toHaveBeenCalled();
      expect(setSelectionRangeSpy).toHaveBeenCalled();
    });

    it('intercepts API 400 error bodies and displays the visual error locator banner', () => {
      const api400Response = {
        error: 'Bad escaped character in JSON at position 16399 (line 205 column 824)',
      };

      render(
        <IngestionDialog
          {...defaultProps}
          ingestResponse={api400Response}
        />
      );

      const banner = screen.getByTestId('syntax-error-banner');
      expect(banner).toBeInTheDocument();

      const pill = screen.getByTestId('syntax-error-pill');
      expect(pill).toHaveTextContent('Syntax Error at Line 205, Col 824');
      expect(screen.getByTestId('jump-to-issue-btn')).toBeInTheDocument();
    });
  });

  describe('TASK-TRK-INGEST-ACCEPT-AS-IS: Fallback Bypass for Unstructured Input', () => {
    it('renders Ingest as Raw Card buttons and dispatches single-task payload', async () => {
      const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        json: async () => ({
          success: true,
          items: [{ id: 'raw-1', title: 'Brainstorm Notes: Q4 Architecture' }],
        }),
      } as any);

      const onRefresh = vi.fn();
      const setIngestResponse = vi.fn();
      const rawNotes = 'Brainstorm Notes: Q4 Architecture\n- decouple services\n- optimize caching';

      render(
        <IngestionDialog
          {...defaultProps}
          sparkPayload={rawNotes}
          sparkOverrideProject="core-app"
          sparkOverrideSprint="Sprint 2026-Q4"
          sparkOverrideAssignee="Tymz"
          setIngestResponse={setIngestResponse}
          onRefresh={onRefresh}
        />
      );

      // Fallback button is available in the bottom action bar
      const ingestAsIsBtn = screen.getByTestId('ingest-as-is-fallback-btn');
      expect(ingestAsIsBtn).toBeInTheDocument();

      fireEvent.click(ingestAsIsBtn);

      await waitFor(() => {
        expect(globalFetchSpy).toHaveBeenCalledWith('/api/v1/items/ingest', expect.objectContaining({
          method: 'POST',
        }));
      });

      const sentBody = JSON.parse(globalFetchSpy.mock.calls[0][1]?.body as string);
      expect(sentBody.project_slug).toBe('core-app');
      expect(sentBody.override_project_slug).toBe('core-app');
      expect(sentBody.override_sprint).toBe('Sprint 2026-Q4');
      expect(sentBody.override_assignee).toBe('Tymz');
      expect(sentBody.items).toHaveLength(1);

      const rawItem = sentBody.items[0];
      expect(rawItem.title).toBe('Brainstorm Notes: Q4 Architecture');
      expect(rawItem.description).toBe(rawNotes);
      expect(rawItem.item_type).toBe('task');
      expect(rawItem.status).toBe('not_started');
      expect(rawItem.metadata.source_type).toBe('raw_manual_ingest');
      expect(rawItem.metadata.raw_payload).toBe(rawNotes);

      // Notification displayed to user
      expect(screen.getByTestId('ingest-toast')).toHaveTextContent(
        'Pasted notes saved as a raw backlog item for manual triage.'
      );
      expect(onRefresh).toHaveBeenCalled();
    });

    it('SparkViewContainer re-exports IngestionDialog and supports all features identically', () => {
      render(<SparkViewContainer {...defaultProps} />);
      expect(screen.getByTestId('ingestion-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('auto-fix-escapes-btn')).toBeInTheDocument();
      expect(screen.getByTestId('execute-ingestion-btn')).toBeInTheDocument();
      expect(screen.getByTestId('ingest-as-is-fallback-btn')).toBeInTheDocument();
    });
  });
});
