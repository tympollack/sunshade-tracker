import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import {
  normalizeProjectSettings,
  useProjectSettings,
  DEFAULT_PROJECT_SETTINGS,
} from '@/hooks/useProjectSettings';
import { ProjectViewErrorBoundary } from '@/components/schema/ProjectViewErrorBoundary';
import { ErrorBoundary } from '@/components/ErrorBoundary';

describe('BUG-TRK-SCHEMA-HYDRATION-GUARD: Schema Normalization & Error Boundary', () => {
  describe('normalizeProjectSettings Unit Tests', () => {
    it('returns a clone of DEFAULT_PROJECT_SETTINGS on null, undefined, or primitive input', () => {
      const fromNull = normalizeProjectSettings(null);
      expect(fromNull).toEqual(DEFAULT_PROJECT_SETTINGS);

      const fromUndefined = normalizeProjectSettings(undefined);
      expect(fromUndefined).toEqual(DEFAULT_PROJECT_SETTINGS);

      const fromString = normalizeProjectSettings('malformed');
      expect(fromString).toEqual(DEFAULT_PROJECT_SETTINGS);

      const fromArray = normalizeProjectSettings([1, 2, 3]);
      expect(fromArray).toEqual(DEFAULT_PROJECT_SETTINGS);
    });

    it('falls back to default hierarchy when hierarchy is empty or not an array', () => {
      const normalized = normalizeProjectSettings({
        hierarchy: [],
        statuses: [{ id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 }],
      });
      expect(normalized.hierarchy.length).toBeGreaterThan(0);
      expect(normalized.hierarchy[0].type).toBe('project');
    });

    it('maps key/id/name aliases for hierarchy items and ensures type is defined', () => {
      const raw = {
        hierarchy: [
          { name: 'initiative', level: 1 },
          { key: 'epic_item', level: 2, label: 'Custom Epic' },
          { id: 'sub_task' },
        ],
        statuses: [
          { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
          { id: 'complete', label: 'Complete', color: '#22c55e', order: 2 },
        ],
      };

      const normalized = normalizeProjectSettings(raw);
      expect(normalized.hierarchy[0].type).toBe('initiative');
      expect(normalized.hierarchy[1].type).toBe('epic_item');
      expect(normalized.hierarchy[1].label).toBe('Custom Epic');
      expect(normalized.hierarchy[2].type).toBe('sub_task');

      // None of the types should be undefined, avoiding toLowerCase crashes
      normalized.hierarchy.forEach((h) => {
        expect(typeof h.type).toBe('string');
        expect(h.type.toLowerCase()).toBeDefined();
      });
    });

    it('maps key/status/name aliases for status items and ensures id is defined', () => {
      const raw = {
        hierarchy: DEFAULT_PROJECT_SETTINGS.hierarchy,
        statuses: [
          { key: 'backlog', name: 'Backlog Bucket' },
          { status: 'active_wip', color: '#38bdf8' },
        ],
      };

      const normalized = normalizeProjectSettings(raw);
      expect(normalized.statuses.some((s) => s.id === 'backlog')).toBe(true);
      expect(normalized.statuses.some((s) => s.id === 'active_wip')).toBe(true);

      normalized.statuses.forEach((s) => {
        expect(typeof s.id).toBe('string');
        expect(s.id.toLowerCase()).toBeDefined();
      });
    });

    it('enforces baseline statuses by injecting not_started and complete when missing', () => {
      const raw = {
        hierarchy: DEFAULT_PROJECT_SETTINGS.hierarchy,
        statuses: [
          { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
          { id: 'review', label: 'Review', color: '#a855f7', order: 3 },
        ],
      };

      const normalized = normalizeProjectSettings(raw);
      const hasNotStarted = normalized.statuses.some((s) => s.id === 'not_started');
      const hasComplete = normalized.statuses.some((s) => s.id === 'complete');

      expect(hasNotStarted).toBe(true);
      expect(hasComplete).toBe(true);
    });

    it('preserves existing custom_fields, sprint_settings, and metric rules', () => {
      const raw = {
        hierarchy: DEFAULT_PROJECT_SETTINGS.hierarchy,
        statuses: DEFAULT_PROJECT_SETTINGS.statuses,
        custom_fields: ['custom_metric', 'deploy_target'],
        sprint_settings: { default_sprint: 'Sprint 42' },
      };

      const normalized = normalizeProjectSettings(raw);
      expect(normalized.custom_fields).toEqual(['custom_metric', 'deploy_target']);
      expect(normalized.sprint_settings?.default_sprint).toBe('Sprint 42');
    });
  });

  describe('useProjectSettings Hook', () => {
    it('normalizes initialSettings and manages updates', () => {
      const { result } = renderHook(() =>
        useProjectSettings({ initialSettings: { hierarchy: null } })
      );

      expect(result.current.settings.hierarchy.length).toBeGreaterThan(0);

      act(() => {
        result.current.setSettings({
          hierarchy: [{ name: 'custom_type', level: 1 }],
          statuses: [{ key: 'open' }],
        });
      });

      expect(result.current.settings.hierarchy[0].type).toBe('custom_type');
      expect(result.current.settings.statuses.some((s) => s.id === 'open')).toBe(true);
      // Still ensures baseline not_started and complete
      expect(result.current.settings.statuses.some((s) => s.id === 'not_started')).toBe(true);
      expect(result.current.settings.statuses.some((s) => s.id === 'complete')).toBe(true);

      act(() => {
        result.current.resetToDefault();
      });

      expect(result.current.settings).toEqual(DEFAULT_PROJECT_SETTINGS);
    });
  });

  describe('ProjectViewErrorBoundary & ErrorBoundary Component', () => {
    // Suppress console.error during deliberate error boundary trigger
    const originalConsoleError = console.error;

    it('renders children when no error occurs', () => {
      render(
        <ProjectViewErrorBoundary>
          <div data-testid="child-view">Normal View Content</div>
        </ProjectViewErrorBoundary>
      );

      expect(screen.getByTestId('child-view').textContent).toBe('Normal View Content');
      expect(screen.queryByTestId('reset-schema-to-default-btn')).toBeNull();
    });

    it('catches runtime exception in child view, renders actionable error card, and restores on 1-click reset', async () => {
      console.error = vi.fn();

      const BuggyChild = ({ crash }: { crash: boolean }) => {
        if (crash) {
          // Simulate the crash: TypeError: Cannot read properties of undefined (reading 'toLowerCase')
          const badStatus: any = undefined;
          return <div>{badStatus.toLowerCase()}</div>;
        }
        return <div data-testid="recovered-child">Recovered Workspace View</div>;
      };

      const Wrapper = () => {
        const [hasCrashed, setHasCrashed] = useState(true);

        const handleReset = async () => {
          setHasCrashed(false);
        };

        return (
          <ProjectViewErrorBoundary onResetToDefault={handleReset}>
            <BuggyChild crash={hasCrashed} />
          </ProjectViewErrorBoundary>
        );
      };

      render(<Wrapper />);

      // Error boundary card should appear
      expect(screen.getByRole('alert')).not.toBeNull();
      expect(screen.getByText(/Malformed Project Schema — Reset to Default/i)).not.toBeNull();
      expect(screen.getByTestId('reset-schema-to-default-btn')).not.toBeNull();

      // Click the 1-click restore button
      fireEvent.click(screen.getByTestId('reset-schema-to-default-btn'));

      // View recovers and child is rendered
      expect(screen.getByTestId('recovered-child')).not.toBeNull();
      expect(screen.getByTestId('recovered-child').textContent).toBe('Recovered Workspace View');
      expect(screen.queryByTestId('reset-schema-to-default-btn')).toBeNull();

      console.error = originalConsoleError;
    });

    it('exports ErrorBoundary alias from src/components/ErrorBoundary', () => {
      expect(ErrorBoundary).toBe(ProjectViewErrorBoundary);
    });
  });
});
