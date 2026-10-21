import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip } from '@/components/analytics/Tooltip';
import { KpiMetricCards } from '@/components/analytics/KpiMetricCards';
import { ScopeChurnWaterfall } from '@/components/analytics/ScopeChurnWaterfall';

describe('TASK-TRK-ANALYTICS-HOVER-TOOLTIPS: Contextual Tooltips', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('Tooltip UI Primitive Accessibility & Ergonomics', () => {
    it('displays tooltip popover after 150ms delay on mouse enter', () => {
      render(
        <Tooltip content="Informative tooltip description">
          <button type="button">Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger');

      // Before hover, tooltip not visible
      expect(screen.queryByTestId('tooltip-popover')).toBeNull();

      fireEvent.mouseEnter(trigger);

      // Fast-forward 100ms (not yet visible due to 150ms delay)
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.queryByTestId('tooltip-popover')).toBeNull();

      // Fast-forward past 150ms threshold
      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(screen.getByTestId('tooltip-popover')).toHaveTextContent('Informative tooltip description');

      // Mouse leave immediately hides tooltip
      fireEvent.mouseLeave(trigger);
      expect(screen.queryByTestId('tooltip-popover')).toBeNull();
    });

    it('supports keyboard navigation via focus and dismisses on Escape', () => {
      render(
        <Tooltip content="Keyboard accessible text">
          <span>Accessible Trigger</span>
        </Tooltip>
      );

      const triggerWrapper = screen.getByText('Accessible Trigger').parentElement!;

      // Focus trigger
      fireEvent.focus(triggerWrapper);
      act(() => {
        vi.advanceTimersByTime(160);
      });

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('Keyboard accessible text');

      // Press Escape key to dismiss
      fireEvent.keyDown(triggerWrapper, { key: 'Escape' });
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });

  describe('KPI Cards Hover Tooltips', () => {
    it('surfaces explanatory tooltips across all 4 KPI symbols and Scope Volatile badge', () => {
      render(
        <KpiMetricCards
          metrics={{
            rollingVelocity: 24,
            sayDoRatio: 88,
            scopeVolatility: 25, // > 20% triggers Scope Volatile badge
            remainingPoints: 40,
            committedPoints: 50,
            deliveredPoints: 44,
          }}
        />
      );

      // 1. 3-Sprint Velocity icon tooltip
      const velocityIcon = screen.getByTestId('tooltip-velocity-icon');
      fireEvent.mouseEnter(velocityIcon);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Weighted average (50/30/20) of completed story points across the last three closed sprints')
      ).toBeInTheDocument();
      fireEvent.mouseLeave(velocityIcon);

      // 2. Commitment (Say/Do) icon tooltip
      const sayDoIcon = screen.getByTestId('tooltip-say-do-icon');
      fireEvent.mouseEnter(sayDoIcon);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Ratio of delivered points relative to Day 1 committed scope (Delivered / Committed * 100)')
      ).toBeInTheDocument();
      fireEvent.mouseLeave(sayDoIcon);

      // 3. Scope Volatility icon tooltip
      const volatilityIcon = screen.getByTestId('tooltip-volatility-icon');
      fireEvent.mouseEnter(volatilityIcon);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Percentage change in total sprint scope after Day 1 activation: (+Added - Dropped) / Baseline * 100')
      ).toBeInTheDocument();
      fireEvent.mouseLeave(volatilityIcon);

      // 4. Uncompleted Scope icon tooltip
      const uncompletedIcon = screen.getByTestId('tooltip-uncompleted-icon');
      fireEvent.mouseEnter(uncompletedIcon);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Story points remaining across not_started, in_progress, and in_review tasks')
      ).toBeInTheDocument();
      fireEvent.mouseLeave(uncompletedIcon);

      // 5. Scope Volatile warning badge tooltip
      const badgeTooltip = screen.getByTestId('tooltip-commitment-badge');
      fireEvent.mouseEnter(badgeTooltip);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Triggers when net injected scope exceeds configured runway tolerance (current: >15%)')
      ).toBeInTheDocument();
    });
  });

  describe('Scope Churn Waterfall Tooltips', () => {
    it('surfaces explanatory tooltips across Net Scope pill and all 4 waterfall bars', () => {
      render(
        <ScopeChurnWaterfall
          data={{
            baselineCommitted: 100,
            addedPoints: 20,
            droppedPoints: 10,
            finalDelivered: 95,
          }}
        />
      );

      // 1. Net Scope pill tooltip
      const netScopePill = screen.getByTestId('tooltip-net-scope-pill');
      fireEvent.mouseEnter(netScopePill);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Current total sprint commitment (Baseline + Added Creep - Dropped)')
      ).toBeInTheDocument();
      fireEvent.mouseLeave(netScopePill);

      // 2. Baseline bar tooltip
      const baselineBar = screen.getByTestId('tooltip-baseline-bar');
      fireEvent.mouseEnter(baselineBar);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Total story points locked in when the sprint was formally activated')
      ).toBeInTheDocument();
      fireEvent.mouseLeave(baselineBar);

      // 3. Added Creep bar tooltip
      const addedBar = screen.getByTestId('tooltip-added-bar');
      fireEvent.mouseEnter(addedBar);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Story points added to this sprint after kickoff via backlog drag or mid-flight creation')
      ).toBeInTheDocument();
      fireEvent.mouseLeave(addedBar);

      // 4. Dropped bar tooltip
      const droppedBar = screen.getByTestId('tooltip-dropped-bar');
      fireEvent.mouseEnter(droppedBar);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Scope removed or deferred back to backlog during active sprint execution')
      ).toBeInTheDocument();
      fireEvent.mouseLeave(droppedBar);

      // 5. Delivered bar tooltip
      const deliveredBar = screen.getByTestId('tooltip-delivered-bar');
      fireEvent.mouseEnter(deliveredBar);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Total story points marked completed. Percentage reflects Delivered / Day 1 Baseline')
      ).toBeInTheDocument();
    });
  });
});
