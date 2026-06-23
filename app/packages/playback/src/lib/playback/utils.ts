import type { StreamLookupPolicy } from "./types";

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Clamps `start` and `end` to `[0, duration]` and rejects inverted or
 * collapsed windows. Returns `null` when the result would be invalid so
 * callers can early-return without writing to atoms.
 */
export function clampAndValidateBounds(
  start: number,
  end: number,
  duration: number
): { start: number; end: number } | null {
  const s = clamp(start, 0, duration);
  const e = clamp(end, 0, duration);
  return e > s ? { start: s, end: e } : null;
}

/**
 * Convert a continuous playback time to a 1-indexed frame number. When
 * `frameCount` is provided, clamps the result to `[1, frameCount]`;
 * otherwise returns the raw `floor(time * fps) + 1`.
 *
 * Shared by streams, server-query helpers, and (eventually) hotkeys so
 * everyone agrees on which frame a given `time` belongs to. 1-indexed
 * because that is the convention `/frames` uses and the labels coming
 * back from the server are keyed on.
 *
 * The `1e-6` epsilon absorbs floating-point error in the
 * `frame → (frame - 1) / fps → frameAt` round-trip: at a non-integer fps,
 * `(n - 1) / fps * fps` can land just below `n - 1`
 * (e.g. `15.999999999999998` at 30.007 fps), which would otherwise floor
 * down a frame and report the *previous* frame. Mirrors the `eps` guard
 * in {@link frameBoundaryStep} / {@link displayedFrameStart}.
 */
export function frameAt(
  time: number,
  fps: number,
  frameCount?: number
): number {
  const raw = Math.floor(time * fps + 1e-6) + 1;
  if (frameCount === undefined) {
    return raw;
  }
  if (raw < 1) return 1;
  if (raw > frameCount) return frameCount;
  return raw;
}

/**
 * Resolves the best cached entry for a given time from a Map<number, T>.
 *
 * "nearest"         — closest entry in either direction within threshold.
 * "nearestPrevious" — closest entry at or before the time within threshold.
 *
 * Returns null if no entry satisfies the policy and threshold.
 *
 * @example
 * const frame = resolveAtTime(frameCache, currentTime, {
 *   type: "nearestPrevious",
 *   thresholdSeconds: 0.1,
 * });
 */
export function resolveAtTime<T>(
  cache: Map<number, T>,
  time: number,
  policy: StreamLookupPolicy
): T | null {
  // Hot path: exact-time hits dominate normal playback (the engine ticks
  // on stream-aligned step intervals), so skip the linear scan when the
  // key is already in the cache.
  if (cache.has(time)) return cache.get(time) as T;

  let bestKey: number | null = null;
  let bestDist = Infinity;

  for (const key of cache.keys()) {
    if (policy.type === "nearestPrevious" && key > time) continue;
    const dist = Math.abs(key - time);
    if (dist <= policy.thresholdSeconds && dist < bestDist) {
      bestDist = dist;
      bestKey = key;
    }
  }

  return bestKey !== null ? (cache.get(bestKey) as T) : null;
}
