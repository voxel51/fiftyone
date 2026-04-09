import type { TimeInt } from "../types";

export interface TimedSample<T> {
  time: TimeInt;
  value: T;
}

/**
 * Return the value of the sample with the largest time <= target.
 * Assumes `samples` is sorted by `time` ascending.
 */
export function latestAt<T>(
  samples: readonly TimedSample<T>[],
  time: TimeInt
): T | undefined {
  if (samples.length === 0) return undefined;

  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].time <= time) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo > 0 ? samples[lo - 1].value : undefined;
}

/**
 * Return the value of the sample with the minimum absolute distance to target.
 * Tie-break: earlier sample wins. Assumes sorted ascending.
 */
export function nearest<T>(
  samples: readonly TimedSample<T>[],
  time: TimeInt
): T | undefined {
  if (samples.length === 0) return undefined;

  // Binary search for insertion point
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].time < time) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // lo is the index of the first element >= time
  const candidates: TimedSample<T>[] = [];
  if (lo > 0) candidates.push(samples[lo - 1]);
  if (lo < samples.length) candidates.push(samples[lo]);

  let best = candidates[0];
  for (const c of candidates) {
    const dist = Math.abs(c.time - time);
    const bestDist = Math.abs(best.time - time);
    if (dist < bestDist || (dist === bestDist && c.time < best.time)) {
      best = c;
    }
  }

  return best.value;
}

/**
 * Return the value only if there's an exact match at `time`.
 */
export function exact<T>(
  samples: readonly TimedSample<T>[],
  time: TimeInt
): T | undefined {
  // Binary search for exact match
  let lo = 0;
  let hi = samples.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].time === time) return samples[mid].value;
    if (samples[mid].time < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/**
 * Linearly interpolate between the two nearest neighbors.
 *
 * @param lerpFn - `(a, b, t) => result` where t is 0..1
 */
export function interpolate<T>(
  samples: readonly TimedSample<T>[],
  time: TimeInt,
  lerpFn: (a: T, b: T, t: number) => T
): T | undefined {
  if (samples.length === 0) return undefined;
  if (samples.length === 1) return samples[0].value;

  // Binary search for insertion point
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].time < time) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Exact match
  if (lo < samples.length && samples[lo].time === time) {
    return samples[lo].value;
  }

  // Clamp to edges
  if (lo === 0) return samples[0].value;
  if (lo >= samples.length) return samples[samples.length - 1].value;

  const before = samples[lo - 1];
  const after = samples[lo];
  const range = after.time - before.time;
  const t = range === 0 ? 0 : (time - before.time) / range;

  return lerpFn(before.value, after.value, t);
}
