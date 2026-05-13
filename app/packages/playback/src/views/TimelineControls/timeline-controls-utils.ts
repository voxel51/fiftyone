/**
 * Formats a time in seconds as `m:ss.cs` (e.g. 1:23.45). Used by the
 * playhead time readout.
 */
export function formatTime(t: number): string {
  const s = Math.floor(t);
  const cs = Math.floor((t - s) * 100);
  return `0:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** Formats a loop bound as `1.23s`. Used by the loop bound readouts. */
export function fmtBound(t: number): string {
  return `${t.toFixed(2)}s`;
}

/**
 * Tolerance in seconds for treating a loop bound as "at the edge". Used to
 * decide whether to render the loop bound readouts and whether each bound
 * should appear muted (already at default position).
 */
export const LOOP_EDGE_EPSILON = 0.02;
