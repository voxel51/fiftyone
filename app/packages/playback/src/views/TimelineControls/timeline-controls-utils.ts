import type { TimelineMode } from "../../lib/playback/types";

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
 * Formats an `absolute`-mode display `Date` as `HH:MM:SS.mmm`. Guards
 * against `Invalid Date` — `toDisplay()` can produce one from an
 * out-of-range `epochAnchorMs`/seconds combination (`Date`'s range is
 * ~±8.64e15ms from the epoch), and `toISOString()` throws on those rather
 * than returning a sentinel string.
 */
export function formatTimeOfDay(d: Date): string {
  if (!Number.isFinite(d.getTime())) return "--:--:--.---";
  // Slice relative to the `T` separator rather than a fixed index — years
  // outside 0000-9999 make `toISOString()` emit an extended `±YYYYYY-MM-DD`
  // date portion, which shifts where the time-of-day substring starts.
  const iso = d.toISOString();
  return iso.slice(iso.indexOf("T") + 1, -1);
}

/**
 * Formats a `TimelineDisplayConversion.toDisplay()` result according to
 * `mode`: a frame index for `sequence`, a time-of-day for `absolute`, or (for
 * `duration`) `formatSeconds` — callers keep their own seconds formatting
 * (`formatTime`'s `m:ss.cs` for the playhead readout, `fmtBound`'s `X.XXs`
 * for loop bounds) since those predate this mode-aware layer and have their
 * own established expectations. Used anywhere a raw seconds-domain readout
 * needs to become mode-aware — ruler ticks, the playhead readout, loop
 * bound readouts.
 */
export function formatDisplayValue(
  value: number | Date,
  mode: TimelineMode,
  formatSeconds: (t: number) => string = formatTime,
): string {
  switch (mode.kind) {
    case "sequence":
      return `#${Math.round(value as number)}`;
    case "absolute":
      return formatTimeOfDay(value as Date);
    case "duration":
    default:
      return formatSeconds(value as number);
  }
}

/**
 * Tolerance in seconds for treating a loop bound as "at the edge". Used to
 * decide whether to render the loop bound readouts and whether each bound
 * should appear muted (already at default position).
 */
export const LOOP_EDGE_EPSILON = 0.02;
