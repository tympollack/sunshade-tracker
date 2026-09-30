/**
 * Agile Telemetry & Algorithm Utilities
 * Calculates weighted trailing velocity, commitment reliability (Say/Do), and net scope volatility.
 */

/**
 * Computes 3-sprint weighted rolling velocity or arithmetic mean for fewer sprints.
 * @param completedSprintPoints Ordered list of completed sprint point totals, most recent first.
 * If >= 3 sprints, weights: 50% (most recent), 30% (t-1), 20% (t-2).
 * If < 3 sprints, returns standard unweighted arithmetic mean. Returns 0 for empty array.
 */
export function calculateRollingVelocity(completedSprintPoints: number[]): number {
  if (!completedSprintPoints || completedSprintPoints.length === 0) {
    return 0;
  }

  const validPoints = completedSprintPoints.map((p) => (typeof p === 'number' && !isNaN(p) ? p : 0));

  if (validPoints.length >= 3) {
    const weighted = validPoints[0] * 0.5 + validPoints[1] * 0.3 + validPoints[2] * 0.2;
    return Math.round(weighted * 10) / 10;
  }

  const sum = validPoints.reduce((acc, pts) => acc + pts, 0);
  const mean = sum / validPoints.length;
  return Math.round(mean * 10) / 10;
}

/**
 * Calculates Say/Do commitment reliability ratio.
 * Formula: (deliveredPoints / committedPoints) * 100, rounded to 1 decimal place.
 * Returns 0 if committedPoints is 0 or negative.
 */
export function calculateSayDoRatio(committedPoints: number, deliveredPoints: number): number {
  const safeCommitted = typeof committedPoints === 'number' && !isNaN(committedPoints) ? committedPoints : 0;
  const safeDelivered = typeof deliveredPoints === 'number' && !isNaN(deliveredPoints) ? deliveredPoints : 0;

  if (safeCommitted <= 0) {
    return 0;
  }

  const ratio = (safeDelivered / safeCommitted) * 100;
  return Math.round(ratio * 10) / 10;
}

/**
 * Calculates Net Scope Volatility percentage.
 * Formula: ((addedPoints - droppedPoints) / baselinePoints) * 100, rounded to 1 decimal place.
 * Returns 0 if baselinePoints is 0 or negative.
 */
export function calculateSprintVolatility(
  baselinePoints: number,
  addedPoints: number,
  droppedPoints: number
): number {
  const safeBaseline = typeof baselinePoints === 'number' && !isNaN(baselinePoints) ? baselinePoints : 0;
  const safeAdded = typeof addedPoints === 'number' && !isNaN(addedPoints) ? addedPoints : 0;
  const safeDropped = typeof droppedPoints === 'number' && !isNaN(droppedPoints) ? droppedPoints : 0;

  if (safeBaseline <= 0) {
    return 0;
  }

  const volatility = ((safeAdded - safeDropped) / safeBaseline) * 100;
  return Math.round(volatility * 10) / 10;
}
