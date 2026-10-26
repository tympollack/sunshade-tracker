import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip } from '@/components/analytics/Tooltip';
import { KpiMetricCards } from '@/components/analytics/KpiMetricCards';
import { ScopeChurnWaterfall, WaterfallCustomTooltip } from '@/components/analytics/ScopeChurnWaterfall';

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

    it('BUG-TRK-TOOLTIP-VIEWPORT-COLLISION: portals directly into document.body with collision flipping and arrow', () => {
      // Simulate trigger positioned near top of viewport (top: 30px < 80px)
      const mockRect = {
        top: 30,
        bottom: 54,
        left: 100,
        right: 150,
        width: 50,
        height: 24,
      };

      const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue(mockRect);

      try {
        const { baseElement } = render(
          <div id="nested-container" style={{ transform: 'scale(0.8)' }}>
            <Tooltip content="Collision handled tooltip" position="top">
              <button type="button">Top Row KPI Button</button>
            </Tooltip>
          </div>
        );

        const btn = screen.getByText('Top Row KPI Button');
        fireEvent.mouseEnter(btn);
        act(() => {
          vi.advanceTimersByTime(160);
        });

        const popover = screen.getByTestId('tooltip-popover');
        expect(popover).toBeInTheDocument();

        // Must be portaled directly to document.body, escaping #nested-container
        expect(document.body).toContainElement(popover);
        const nestedContainer = baseElement.querySelector('#nested-container');
        expect(nestedContainer).not.toContainElement(popover);

        // Auto-flipped to bottom because top clearance (30px) is < 80px
        expect(popover).toHaveAttribute('data-side', 'bottom');

        // Anchored arrow rendered with fill-slate-900
        const arrow = screen.getByTestId('tooltip-arrow');
        expect(arrow).toBeInTheDocument();
        expect(arrow).toHaveClass('fill-slate-900');

        // Stacking invariants
        expect(popover).toHaveClass('z-50', 'pointer-events-none');
      } finally {
        Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      }
    });

    it('uses viewport-relative fixed coordinates without adding page scroll offset', () => {
      const mockRect = {
        top: 200,
        bottom: 240,
        left: 100,
        right: 150,
        width: 50,
        height: 40,
      };

      const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue(mockRect);
      window.scrollY = 600;

      try {
        render(
          <Tooltip content="Scroll invariant" position="bottom" sideOffset={8}>
            <button type="button">Scroll Target</button>
          </Tooltip>
        );

        const btn = screen.getByText('Scroll Target');
        fireEvent.mouseEnter(btn);
        act(() => {
          vi.advanceTimersByTime(160);
        });

        const popover = screen.getByTestId('tooltip-popover');
        expect(popover).toBeInTheDocument();
        // Top should be bottom (240) + sideOffset (8) = 248px, NOT 600 + 248 = 848px
        expect(popover.style.top).toBe('248px');
      } finally {
        window.scrollY = 0;
        Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      }
    });

    it('updates fixed coordinates when window or container scrolls while tooltip is visible', () => {
      let currentTop = 200;
      const getMockRect = () => ({
        top: currentTop,
        bottom: currentTop + 40,
        left: 100,
        right: 150,
        width: 50,
        height: 40,
      });

      const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = vi.fn().mockImplementation(getMockRect);

      try {
        render(
          <Tooltip content="Dynamic scroll attached" position="bottom" sideOffset={8}>
            <button type="button">Scroll Target</button>
          </Tooltip>
        );

        const btn = screen.getByText('Scroll Target');
        fireEvent.mouseEnter(btn);
        act(() => {
          vi.advanceTimersByTime(160);
        });

        const popover = screen.getByTestId('tooltip-popover');
        expect(popover).toBeInTheDocument();
        expect(popover.style.top).toBe('248px');

        // Trigger scrolls upwards by 50px (simulating page or container scroll)
        currentTop = 150;
        act(() => {
          window.dispatchEvent(new Event('scroll'));
        });

        // Tooltip follows trigger immediately: 150 + 40 + 8 = 198px
        expect(popover.style.top).toBe('198px');
      } finally {
        Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      }
    });

    it('enforces collisionPadding against viewport boundaries to avoid overflowing', () => {
      // Trigger placed near right edge of 400px viewport: left: 350, width: 40 (center 370)
      const mockTriggerRect = {
        top: 200,
        bottom: 240,
        left: 350,
        right: 390,
        width: 40,
        height: 40,
      };

      const mockPopoverRect = {
        top: 0,
        bottom: 50,
        left: 0,
        right: 120,
        width: 120,
        height: 50,
      };

      const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function (this: Element) {
        if (this.getAttribute('data-testid') === 'tooltip-popover') {
          return mockPopoverRect as DOMRect;
        }
        return mockTriggerRect as DOMRect;
      };
      const originalInnerWidth = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 400 });

      try {
        render(
          <Tooltip content="Edge clamped" position="top" collisionPadding={40}>
            <button type="button">Right Edge Button</button>
          </Tooltip>
        );

        const btn = screen.getByText('Right Edge Button');
        fireEvent.mouseEnter(btn);
        act(() => {
          vi.advanceTimersByTime(160);
        });

        const popover = screen.getByTestId('tooltip-popover');
        expect(popover).toBeInTheDocument();

        // Popover width: 120px. Viewport width: 400px. collisionPadding: 40px.
        // maxLeft = 400 - 40 - 60 = 300px.
        // Trigger center is 370px, which exceeds 300px, so it must be clamped to 300px.
        const leftValue = parseFloat(popover.style.left);
        expect(leftValue).toBeLessThanOrEqual(300);
      } finally {
        Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth });
      }
    });

    it('flips placement from bottom to top on first open when rendered popover height exceeds bottom clearance', () => {
      // Trigger placed near bottom of 800px viewport: top: 720, bottom: 750 (clearance 50px)
      const mockTriggerRect = {
        top: 720,
        bottom: 750,
        left: 200,
        right: 250,
        width: 50,
        height: 30,
      };

      // Tall tooltip content: 80px height
      const mockPopoverRect = {
        top: 0,
        bottom: 80,
        left: 0,
        right: 150,
        width: 150,
        height: 80,
      };

      const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function (this: Element) {
        if (this.getAttribute('data-testid') === 'tooltip-popover') {
          return mockPopoverRect as DOMRect;
        }
        return mockTriggerRect as DOMRect;
      };

      try {
        render(
          <Tooltip content="Tall multiline tooltip description" position="bottom" collisionPadding={16}>
            <button type="button">Near Bottom Trigger</button>
          </Tooltip>
        );

        const btn = screen.getByText('Near Bottom Trigger');
        fireEvent.mouseEnter(btn);
        act(() => {
          vi.advanceTimersByTime(160);
        });

        const popover = screen.getByTestId('tooltip-popover');
        expect(popover).toBeInTheDocument();
        // Since bottom clearance (50px) is less than sideOffset (8) + tooltipHeight (80) + collisionPadding (16) = 104px,
        // it must auto-flip to top on first open!
        expect(popover).toHaveAttribute('data-side', 'top');
      } finally {
        Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      }
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
        screen.getByText(/Triggers when net injected scope exceeds configured runway tolerance \(current: >20%\)/)
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
      fireEvent.mouseLeave(deliveredBar);
    });

    it('BUG-TRK-CHART-TOOLTIP-CURSOR-TRACKING: surfaces stage definition tooltips on footer metric labels', () => {
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

      // 1. Day 1 Commitment label tooltip
      const baselineFooter = screen.getByTestId('tooltip-baseline-footer');
      fireEvent.mouseEnter(baselineFooter);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Total story points locked in when the sprint was formally activated')
      ).toBeInTheDocument();
      fireEvent.mouseLeave(baselineFooter);

      // 2. Injected Scope label tooltip
      const addedFooter = screen.getByTestId('tooltip-added-footer');
      fireEvent.mouseEnter(addedFooter);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Story points added to this sprint after kickoff via backlog drag or mid-flight creation')
      ).toBeInTheDocument();
      fireEvent.mouseLeave(addedFooter);

      // 3. Backlog Return label tooltip
      const droppedFooter = screen.getByTestId('tooltip-dropped-footer');
      fireEvent.mouseEnter(droppedFooter);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Scope removed or deferred back to backlog during active sprint execution')
      ).toBeInTheDocument();
      fireEvent.mouseLeave(droppedFooter);

      // 4. Delivered % label tooltip
      const deliveredFooter = screen.getByTestId('tooltip-delivered-footer');
      fireEvent.mouseEnter(deliveredFooter);
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(
        screen.getByText('Total story points marked completed. Percentage reflects Delivered / Day 1 Baseline')
      ).toBeInTheDocument();
      fireEvent.mouseLeave(deliveredFooter);
    });

    it('BUG-TRK-CHART-TOOLTIP-CURSOR-TRACKING: renders WaterfallCustomTooltip unified card with stage name, value points, and description', () => {
      const mockPayload = [
        {
          dataKey: 'value',
          payload: {
            name: 'Added Creep',
            value: 26,
            description: 'Story points added to this sprint after kickoff via backlog drag or mid-flight creation',
          },
        },
      ];

      const { rerender } = render(<WaterfallCustomTooltip active={true} payload={mockPayload} />);

      const card = screen.getByTestId('waterfall-custom-tooltip');
      expect(card).toBeInTheDocument();
      expect(screen.getByText('Added Creep')).toBeInTheDocument();
      expect(screen.getByText('26 pts')).toBeInTheDocument();
      expect(
        screen.getByText('Story points added to this sprint after kickoff via backlog drag or mid-flight creation')
      ).toBeInTheDocument();

      // Returns null when not active or empty payload
      rerender(<WaterfallCustomTooltip active={false} payload={mockPayload} />);
      expect(screen.queryByTestId('waterfall-custom-tooltip')).toBeNull();

      rerender(<WaterfallCustomTooltip active={true} payload={[]} />);
      expect(screen.queryByTestId('waterfall-custom-tooltip')).toBeNull();
    });
  });
});
