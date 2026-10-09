'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, Calendar, RotateCcw } from 'lucide-react';
import {
  SupportedTimeframe,
  stepDateRange,
  isNextPeriodInFuture,
  getPeriodRange,
  getWeekRange,
  getMonthRange,
  getQuarterRange,
  getYearRange,
} from '@/lib/utils/dateRanges';

export type StatementTimeframe = SupportedTimeframe;

export interface StatementDateStepperProps {
  timeframe: StatementTimeframe;
  startDate: string;
  endDate: string;
  periodLabel?: string;
  onTimeframeChange: (tf: StatementTimeframe) => void;
  onRangeChange: (start: string, end: string, label?: string) => void;
  className?: string;
}

const TIMEFRAMES: StatementTimeframe[] = ['week', 'month', 'quarter', 'year', 'custom'];

export function StatementDateStepper({
  timeframe,
  startDate,
  endDate,
  periodLabel,
  onTimeframeChange,
  onRangeChange,
  className = '',
}: StatementDateStepperProps) {
  // Check if stepping forward would enter the future
  const isNextDisabled = isNextPeriodInFuture(timeframe, startDate);

  const handleTimeframeClick = (tf: StatementTimeframe) => {
    onTimeframeChange(tf);
    if (tf !== 'custom') {
      const range = getPeriodRange(tf);
      onRangeChange(range.startDate, range.endDate, range.label);
    }
  };

  const handleStep = (direction: 'prev' | 'next') => {
    if (direction === 'next' && isNextDisabled) return;
    const nextRange = stepDateRange(timeframe, startDate, direction);
    onRangeChange(nextRange.startDate, nextRange.endDate, nextRange.label);
  };

  const handleToday = () => {
    const currentRange = getPeriodRange(timeframe === 'custom' ? 'week' : timeframe);
    onRangeChange(currentRange.startDate, currentRange.endDate, currentRange.label);
  };

  // Compute display label if not provided
  const displayLabel = React.useMemo(() => {
    if (periodLabel) return periodLabel;
    if (timeframe === 'week') {
      return getWeekRange(startDate, 0).label;
    }
    if (timeframe === 'month') {
      return getMonthRange(startDate, 0).label;
    }
    if (timeframe === 'quarter') {
      return getQuarterRange(startDate, 0).label;
    }
    if (timeframe === 'year') {
      return getYearRange(startDate, 0).label;
    }
    return `${startDate} \u2013 ${endDate}`;
  }, [periodLabel, timeframe, startDate, endDate]);

  return (
    <div
      className={`flex flex-col gap-3 ${className}`}
      data-testid="statement-date-stepper"
    >
      {/* Timeframe Presets Row: [ Week ] [ Month ] [ Quarter ] [ Year ] [ Custom ] */}
      <div className="flex flex-wrap items-center gap-2" data-testid="timeframe-selector">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
          Timeframe:
        </span>
        {TIMEFRAMES.map((tf) => {
          const isActive = timeframe === tf;
          return (
            <button
              key={tf}
              type="button"
              data-testid={`timeframe-btn-${tf}`}
              onClick={() => handleTimeframeClick(tf)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                isActive
                  ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold ring-1 ring-emerald-400/50'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/90 border border-slate-700/40'
              }`}
            >
              {tf}
            </button>
          );
        })}
      </div>

      {/* Temporal Stepper Toolbar (‹ Prev | Current Period | Next › | [ Today ]) */}
      {timeframe !== 'custom' && (
        <div
          className="flex flex-wrap items-center gap-2 pt-1"
          data-testid="stepper-toolbar"
        >
          {/* Stepper controls group */}
          <div className="flex items-center rounded-lg bg-slate-950/80 border border-slate-800/90 p-0.5 shadow-inner">
            <button
              type="button"
              data-testid="stepper-prev-btn"
              onClick={() => handleStep('prev')}
              className="flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/90 transition-colors cursor-pointer"
              title="Previous period"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            <span
              className="px-3 py-0.5 text-xs font-mono font-medium text-slate-200 border-x border-slate-800/80 select-none whitespace-nowrap min-w-[140px] text-center"
              data-testid="stepper-current-label"
            >
              {displayLabel}
            </span>

            <button
              type="button"
              data-testid="stepper-next-btn"
              disabled={isNextDisabled}
              onClick={() => handleStep('next')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                isNextDisabled
                  ? 'text-slate-600 opacity-40 cursor-not-allowed'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/90 cursor-pointer'
              }`}
              title={isNextDisabled ? 'Future periods unavailable' : 'Next period'}
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Jump to Today Button */}
          <button
            type="button"
            data-testid="stepper-today-btn"
            onClick={handleToday}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white text-xs font-medium border border-slate-700/50 transition-colors cursor-pointer"
            title="Reset to current period"
          >
            <Calendar className="w-3 h-3 text-emerald-400" />
            <span>Today</span>
          </button>
        </div>
      )}
    </div>
  );
}
