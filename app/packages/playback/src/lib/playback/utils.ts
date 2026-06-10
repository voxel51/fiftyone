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
