'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

export type ChunkWindowPreset = '1W' | '2W' | '4W';

export const CHUNK_WINDOW_DAYS: Record<ChunkWindowPreset, number> = {
  '1W': 7,
  '2W': 14,
  '4W': 28,
};

export interface ZoomedDateRange {
  startDate: string;
  endDate: string;
  windowDays: number;
  source?: 'brush' | ChunkWindowPreset;
}

export interface PinnedChartPoint {
  date: string;
  index: number;
}

export interface UseChartDateZoomOptions<T extends { date: string }> {
  data: T[];
  sprintStartDate?: string | null;
  sprintEndDate?: string | null;
  today?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIsoDateUtcMs(dateStr: string): number {
  if (!dateStr) return NaN;
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-').map(Number);
  if (parts.length < 3 || parts.some((n) => isNaN(n))) return NaN;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

export function formatUtcMsToIsoDate(ms: number): string {
  return new Date(ms).toISOString().split('T')[0];
}

export function diffDaysInclusive(startDate: string, endDate: string): number {
  const startMs = parseIsoDateUtcMs(startDate);
  const endMs = parseIsoDateUtcMs(endDate);
  if (isNaN(startMs) || isNaN(endMs)) return 1;
  return Math.max(1, Math.round(Math.abs(endMs - startMs) / DAY_MS) + 1);
}

/**
 * Computes a centered date window [startDate, endDate] of `windowDays` length around `anchorDate`,
 * clamped cleanly to `[minBoundDate, maxBoundDate]`.
 */
export function computeCenteredDateWindow(
  anchorDate: string,
  windowDays: number,
  minBoundDate: string,
  maxBoundDate: string
): { startDate: string; endDate: string; windowDays: number } {
  const anchorMs = parseIsoDateUtcMs(anchorDate);
  const minMs = parseIsoDateUtcMs(minBoundDate);
  const maxMs = parseIsoDateUtcMs(maxBoundDate);

  const safeDays = Math.max(2, Math.round(windowDays));

  if (isNaN(anchorMs) || isNaN(minMs) || isNaN(maxMs) || minMs > maxMs) {
    return {
      startDate: minBoundDate || anchorDate,
      endDate: maxBoundDate || anchorDate,
      windowDays: safeDays,
    };
  }

  const halfBefore = Math.floor((safeDays - 1) / 2);
  const halfAfter = safeDays - 1 - halfBefore;

  let startMs = anchorMs - halfBefore * DAY_MS;
  let endMs = anchorMs + halfAfter * DAY_MS;

  if (startMs < minMs) {
    const shift = minMs - startMs;
    startMs = minMs;
    endMs = Math.min(maxMs, endMs + shift);
  }

  if (endMs > maxMs) {
    const shift = endMs - maxMs;
    endMs = maxMs;
    startMs = Math.max(minMs, startMs - shift);
  }

  const actualDays = Math.max(1, Math.round((endMs - startMs) / DAY_MS) + 1);

  return {
    startDate: formatUtcMsToIsoDate(startMs),
    endDate: formatUtcMsToIsoDate(endMs),
    windowDays: actualDays,
  };
}

function extractDateFromArg(
  dateOrEvent?: string | { activeLabel?: string } | null
): string | null {
  if (!dateOrEvent) return null;
  if (typeof dateOrEvent === 'string') return dateOrEvent;
  if (typeof dateOrEvent === 'object' && typeof dateOrEvent.activeLabel === 'string') {
    return dateOrEvent.activeLabel;
  }
  return null;
}

export function useChartDateZoom<T extends { date: string }>({
  data,
  sprintStartDate,
  sprintEndDate,
  today,
}: UseChartDateZoomOptions<T>) {
  const [zoomedRange, setZoomedRange] = useState<ZoomedDateRange | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
  const [pinnedPoint, setPinnedPoint] = useState<PinnedChartPoint | null>(null);

  const dragStartRef = useRef<string | null>(null);
  const dragCurrentRef = useRef<string | null>(null);
  const didDragSpanRef = useRef<boolean>(false);

  // Determine clamping bounds [minBound, maxBound]
  const bounds = useMemo(() => {
    const todayISO = (today || new Date().toISOString()).split('T')[0];
    const sprintStartISO = sprintStartDate ? sprintStartDate.split('T')[0] : null;
    const sprintEndISO = sprintEndDate ? sprintEndDate.split('T')[0] : null;
    const horizonMaxISO = sprintEndISO && sprintEndISO < todayISO ? sprintEndISO : todayISO;

    const firstDataDate = data && data.length > 0 ? data[0].date : null;
    const lastDataDate = data && data.length > 0 ? data[data.length - 1].date : null;

    const minBound =
      sprintStartISO && firstDataDate
        ? sprintStartISO > firstDataDate
          ? sprintStartISO
          : firstDataDate
        : firstDataDate || sprintStartISO || todayISO;

    const maxBound =
      lastDataDate && lastDataDate <= horizonMaxISO
        ? lastDataDate
        : horizonMaxISO && firstDataDate && horizonMaxISO >= firstDataDate
        ? horizonMaxISO
        : lastDataDate || horizonMaxISO;

    return {
      minBound: minBound <= maxBound ? minBound : firstDataDate || minBound,
      maxBound: minBound <= maxBound ? maxBound : lastDataDate || maxBound,
    };
  }, [data, sprintStartDate, sprintEndDate, today]);

  // Visible data sliced to zoomedRange when active
  const visibleData = useMemo(() => {
    if (!data || data.length === 0) return [];
    if (!zoomedRange) return data;
    const sliced = data.filter(
      (d) => d.date >= zoomedRange.startDate && d.date <= zoomedRange.endDate
    );
    return sliced.length > 0 ? sliced : data;
  }, [data, zoomedRange]);

  const onMouseDown = useCallback(
    (dateOrEvent?: string | { activeLabel?: string } | null) => {
      const date = extractDateFromArg(dateOrEvent);
      if (!date) return;
      dragStartRef.current = date;
      dragCurrentRef.current = date;
      didDragSpanRef.current = false;
      setRefAreaLeft(date);
      setRefAreaRight(date);
    },
    []
  );

  const onMouseMove = useCallback(
    (dateOrEvent?: string | { activeLabel?: string } | null) => {
      if (!dragStartRef.current) return;
      const date = extractDateFromArg(dateOrEvent);
      if (!date) return;
      dragCurrentRef.current = date;
      if (date !== dragStartRef.current) {
        didDragSpanRef.current = true;
      }
      setRefAreaRight(date);
    },
    []
  );

  const onMouseUp = useCallback(() => {
    const left = dragStartRef.current ?? refAreaLeft;
    const right = dragCurrentRef.current ?? refAreaRight;

    dragStartRef.current = null;
    dragCurrentRef.current = null;
    setRefAreaLeft(null);
    setRefAreaRight(null);

    if (!left || !right || left === right) {
      return;
    }

    const minDate = left <= right ? left : right;
    const maxDate = left <= right ? right : left;

    // Require a minimum span of >= 2 data points so single clicks do not trigger micro-zooms
    const sourceSeries = visibleData.length > 0 ? visibleData : data;
    const pointsInSpan = sourceSeries.filter(
      (d) => d.date >= minDate && d.date <= maxDate
    );

    if (pointsInSpan.length >= 2) {
      didDragSpanRef.current = true;
      const windowDays = diffDaysInclusive(minDate, maxDate);
      setZoomedRange({
        startDate: minDate,
        endDate: maxDate,
        windowDays: Math.max(pointsInSpan.length, windowDays),
        source: 'brush',
      });
      setPinnedPoint(null);
    }
  }, [refAreaLeft, refAreaRight, visibleData, data]);

  const onPointClick = useCallback((date: string, index: number) => {
    if (didDragSpanRef.current) {
      didDragSpanRef.current = false;
      return;
    }
    setPinnedPoint((prev) =>
      prev && prev.date === date ? null : { date, index }
    );
  }, []);

  const dismissPinnedPoint = useCallback(() => {
    setPinnedPoint(null);
  }, []);

  const zoomAroundDate = useCallback(
    (anchorDate: string, chunk: ChunkWindowPreset | number) => {
      const requestedDays =
        typeof chunk === 'number' ? chunk : CHUNK_WINDOW_DAYS[chunk];
      const centered = computeCenteredDateWindow(
        anchorDate,
        requestedDays,
        bounds.minBound,
        bounds.maxBound
      );
      const nextRange: ZoomedDateRange = {
        startDate: centered.startDate,
        endDate: centered.endDate,
        windowDays: requestedDays,
        source: typeof chunk === 'string' ? chunk : 'brush',
      };
      setZoomedRange(nextRange);
      setPinnedPoint(null);
      return nextRange;
    },
    [bounds.minBound, bounds.maxBound]
  );

  const resetZoom = useCallback(() => {
    setZoomedRange(null);
    setPinnedPoint(null);
    setRefAreaLeft(null);
    setRefAreaRight(null);
    dragStartRef.current = null;
    dragCurrentRef.current = null;
    didDragSpanRef.current = false;
  }, []);

  const canStepPrev = useMemo(() => {
    if (!zoomedRange) return false;
    return zoomedRange.startDate > bounds.minBound;
  }, [zoomedRange, bounds.minBound]);

  const canStepNext = useMemo(() => {
    if (!zoomedRange) return false;
    return zoomedRange.endDate < bounds.maxBound;
  }, [zoomedRange, bounds.maxBound]);

  const stepPrev = useCallback(() => {
    setZoomedRange((prev) => {
      if (!prev) return null;
      const startMs = parseIsoDateUtcMs(prev.startDate);
      const endMs = parseIsoDateUtcMs(prev.endDate);
      const minMs = parseIsoDateUtcMs(bounds.minBound);
      const maxMs = parseIsoDateUtcMs(bounds.maxBound);
      if (isNaN(startMs) || isNaN(endMs) || isNaN(minMs)) return prev;

      const spanDays = Math.max(2, prev.windowDays || diffDaysInclusive(prev.startDate, prev.endDate));
      const shiftMs = spanDays * DAY_MS;

      let nextStartMs = startMs - shiftMs;
      let nextEndMs = endMs - shiftMs;

      if (nextStartMs < minMs) {
        nextStartMs = minMs;
        nextEndMs = Math.min(
          isNaN(maxMs) ? endMs : maxMs,
          nextStartMs + (spanDays - 1) * DAY_MS
        );
      }

      return {
        ...prev,
        startDate: formatUtcMsToIsoDate(nextStartMs),
        endDate: formatUtcMsToIsoDate(nextEndMs),
      };
    });
  }, [bounds.minBound, bounds.maxBound]);

  const stepNext = useCallback(() => {
    setZoomedRange((prev) => {
      if (!prev) return null;
      const startMs = parseIsoDateUtcMs(prev.startDate);
      const endMs = parseIsoDateUtcMs(prev.endDate);
      const minMs = parseIsoDateUtcMs(bounds.minBound);
      const maxMs = parseIsoDateUtcMs(bounds.maxBound);
      if (isNaN(startMs) || isNaN(endMs) || isNaN(maxMs)) return prev;

      const spanDays = Math.max(2, prev.windowDays || diffDaysInclusive(prev.startDate, prev.endDate));
      const shiftMs = spanDays * DAY_MS;

      let nextStartMs = startMs + shiftMs;
      let nextEndMs = endMs + shiftMs;

      if (nextEndMs > maxMs) {
        nextEndMs = maxMs;
        nextStartMs = Math.max(
          isNaN(minMs) ? startMs : minMs,
          nextEndMs - (spanDays - 1) * DAY_MS
        );
      }

      return {
        ...prev,
        startDate: formatUtcMsToIsoDate(nextStartMs),
        endDate: formatUtcMsToIsoDate(nextEndMs),
      };
    });
  }, [bounds.minBound, bounds.maxBound]);

  // Bind Escape key to reset zoom or dismiss pinned popover
  useEffect(() => {
    if (!zoomedRange && !pinnedPoint) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoomedRange) {
          resetZoom();
        } else if (pinnedPoint) {
          setPinnedPoint(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomedRange, pinnedPoint, resetZoom]);

  const isDragging = Boolean(
    refAreaLeft && refAreaRight && refAreaLeft !== refAreaRight
  );

  return {
    zoomedRange,
    setZoomedRange,
    isZoomed: zoomedRange !== null,
    visibleData,
    refAreaLeft,
    refAreaRight,
    isDragging,
    pinnedPoint,
    setPinnedPoint,
    dismissPinnedPoint,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onPointClick,
    zoomAroundDate,
    stepPrev,
    stepNext,
    canStepPrev,
    canStepNext,
    resetZoom,
    bounds,
  };
}

export default useChartDateZoom;
