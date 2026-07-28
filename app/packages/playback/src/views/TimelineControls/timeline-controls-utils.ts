/**
 * Formats a time in seconds as `m:ss.cs` (e.g. 1:23.45). Used by the
 * playhead time readout. Clamps non-finite / negative input to 0.
 */
export function formatTime(t: number): string {
  const safe = Number.isFinite(t) && t > 0 ? t : 0;
  const totalCs = Math.floor(safe * 100);
  const m = Math.floor(totalCs / 6000);
  const s = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
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
