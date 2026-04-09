/**
 * Cross-timeline conversion helpers.
 *
 * These let subscribers translate between sequence frame numbers and
 * duration nanoseconds, given a known FPS and optional time origin.
 */

/**
 * Convert a 1-indexed sequence frame number to duration nanoseconds.
 *
 * @param frame - 1-indexed frame number
 * @param fps - frames per second
 * @param originNanos - optional time origin offset in nanoseconds (default 0)
 */
export function sequenceToDuration(
  frame: number,
  fps: number,
  originNanos = 0
): number {
  // frame 1 → time 0 (relative to origin)
  const seconds = (frame - 1) / fps;
  return originNanos + seconds * 1e9;
}

/**
 * Convert duration nanoseconds to a 1-indexed sequence frame number.
 *
 * @param nanos - time in nanoseconds
 * @param fps - frames per second
 * @param originNanos - optional time origin offset in nanoseconds (default 0)
 */
export function durationToSequence(
  nanos: number,
  fps: number,
  originNanos = 0
): number {
  const seconds = (nanos - originNanos) / 1e9;
  return Math.round(seconds * fps) + 1;
}
