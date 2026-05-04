import type { StreamLookupPolicy } from "./playback-types";

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
