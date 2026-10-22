import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalyticsHeader, SprintOption } from '@/components/analytics/AnalyticsHeader';

describe('TASK-TRK-ANALYTICS-DATE-SPRINT-SYNC: Analytics Date & Sprint Scope Synchronization', () => {
  const mockSprints: SprintOption[] = [
    {
      id: 'sp-q4-1',
      name: 'Sprint 2026-Q4-1',
      is_active: true,
      start_date: '2026-10-01T00:00:00.000Z',
      end_date: '2026-10-15T00:00:00.000Z',
    },
    {
      id: 'sp-q4-2',
      name: 'Sprint 2026-Q4-2',
      is_active: false,
      start_date: '2026-10-16T00:00:00.000Z',
      end_date: '2026-10-30T00:00:00.000Z',
    },
  ];

  it('renders sprint selector and date pickers without custom badge by default', () => {
    render(
      <AnalyticsHeader
        tenantSlug="sunshade"
        projectSlug="tracker"
        sprints={mockSprints}
        selectedSprintId="sp-q4-1"
        onSelectSprint={vi.fn()}
        startDate="2026-10-01"
        endDate="2026-10-15"
        onChangeStartDate={vi.fn()}
        onChangeEndDate={vi.fn()}
        isCustomDateRange={false}
      />
    );

    expect(screen.getByTestId('sprint-select')).toHaveValue('sp-q4-1');
    expect(screen.getByTestId('analytics-start-date')).toHaveValue('2026-10-01');
    expect(screen.getByTestId('analytics-end-date')).toHaveValue('2026-10-15');

    // No custom badge and no reset button
    expect(screen.queryByTestId('custom-dates-active-badge')).toBeNull();
    expect(screen.queryByTestId('reset-sprint-dates-btn')).toBeNull();
  });

  it('displays [Custom Dates Active] badge and reset button when custom dates are active', () => {
    const handleReset = vi.fn();

    render(
      <AnalyticsHeader
        tenantSlug="sunshade"
        projectSlug="tracker"
        sprints={mockSprints}
        selectedSprintId="sp-q4-1"
        onSelectSprint={vi.fn()}
        startDate="2026-10-05"
        endDate="2026-10-25"
        onChangeStartDate={vi.fn()}
        onChangeEndDate={vi.fn()}
        isCustomDateRange={true}
        onResetToSprintDates={handleReset}
      />
    );

    const badge = screen.getByTestId('custom-dates-active-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Custom Dates Active');

    const resetBtn = screen.getByTestId('reset-sprint-dates-btn');
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(resetBtn);
    expect(handleReset).toHaveBeenCalledTimes(1);
  });

  it('performs bi-directional synchronization between sprint selector and calendar date controls', () => {
    function SyncWrapper() {
      const [selectedSprintId, setSelectedSprintId] = useState('sp-q4-1');
      const [startDate, setStartDate] = useState('2026-10-01');
      const [endDate, setEndDate] = useState('2026-10-15');
      const [isCustomDateRange, setIsCustomDateRange] = useState(false);

      const handleSelectSprint = (id: string) => {
        setSelectedSprintId(id);
        const sprint = mockSprints.find((s) => s.id === id);
        if (sprint?.start_date && sprint?.end_date) {
          setStartDate(sprint.start_date.split('T')[0]);
          setEndDate(sprint.end_date.split('T')[0]);
          setIsCustomDateRange(false);
        }
      };

      const handleReset = () => {
        const sprint = mockSprints.find((s) => s.id === selectedSprintId);
        if (sprint?.start_date && sprint?.end_date) {
          setStartDate(sprint.start_date.split('T')[0]);
          setEndDate(sprint.end_date.split('T')[0]);
        }
        setIsCustomDateRange(false);
      };

      return (
        <AnalyticsHeader
          tenantSlug="sunshade"
          projectSlug="tracker"
          sprints={mockSprints}
          selectedSprintId={selectedSprintId}
          onSelectSprint={handleSelectSprint}
          startDate={startDate}
          endDate={endDate}
          onChangeStartDate={(d) => {
            setStartDate(d);
            setIsCustomDateRange(true);
          }}
          onChangeEndDate={(d) => {
            setEndDate(d);
            setIsCustomDateRange(true);
          }}
          isCustomDateRange={isCustomDateRange}
          onResetToSprintDates={handleReset}
        />
      );
    }

    render(<SyncWrapper />);

    // 1. Initially matching Sprint 1 boundaries
    expect(screen.getByTestId('analytics-start-date')).toHaveValue('2026-10-01');
    expect(screen.getByTestId('analytics-end-date')).toHaveValue('2026-10-15');
    expect(screen.queryByTestId('custom-dates-active-badge')).toBeNull();

    // 2. Switching to Sprint 2 automatically synchronizes date inputs
    fireEvent.change(screen.getByTestId('sprint-select'), { target: { value: 'sp-q4-2' } });
    expect(screen.getByTestId('analytics-start-date')).toHaveValue('2026-10-16');
    expect(screen.getByTestId('analytics-end-date')).toHaveValue('2026-10-30');
    expect(screen.queryByTestId('custom-dates-active-badge')).toBeNull();

    // 3. User modifies start date manually
    fireEvent.change(screen.getByTestId('analytics-start-date'), { target: { value: '2026-10-20' } });
    expect(screen.getByTestId('custom-dates-active-badge')).toBeInTheDocument();
    expect(screen.getByTestId('reset-sprint-dates-btn')).toBeInTheDocument();

    // 4. Clicking reset snaps dates back to Sprint 2 boundaries
    fireEvent.click(screen.getByTestId('reset-sprint-dates-btn'));
    expect(screen.getByTestId('analytics-start-date')).toHaveValue('2026-10-16');
    expect(screen.getByTestId('analytics-end-date')).toHaveValue('2026-10-30');
    expect(screen.queryByTestId('custom-dates-active-badge')).toBeNull();
  });
});
