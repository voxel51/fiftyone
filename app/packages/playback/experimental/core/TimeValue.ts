import type { TimeInt, TimeReal, TimeRange, TimelineType } from "../types";

/**
 * Quantize a smooth time value to an integer based on timeline type.
 * - sequence: round to nearest integer (frame number)
 * - duration/timestamp: floor to nanoseconds
 */
export function quantize(real: TimeReal, type: TimelineType): TimeInt {
  if (type === "sequence") {
    return Math.round(real);
  }
  // duration / timestamp: floor to integer nanoseconds
  return Math.floor(real);
}

/**
 * Clamp a time value to the given inclusive range.
 */
export function clampTime(value: TimeInt, range: TimeRange): TimeInt {
  return Math.max(range[0], Math.min(range[1], value));
}

/**
 * Check whether a value falls within an inclusive range.
 */
export function isInRange(value: TimeInt, range: TimeRange): boolean {
  return value >= range[0] && value <= range[1];
}

/**
 * Build the canonical range for a sequence timeline: [1, totalFrames].
 */
export function sequenceRange(totalFrames: number): TimeRange {
  return [1, totalFrames] as const;
}
