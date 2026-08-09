/**
 * Min-max bucket decimation for numeric time series. Unlike uniform
 * stride (see `decimateTrajectory`), keeping each bucket's minimum and
 * maximum preserves spikes — the whole point of plotting telemetry.
 */

import { NUMERIC_SERIES_MAX_BUCKET_SURVIVORS } from "../../../runtime/numeric-series-window";

/** Gap positions recorded for each source bucket. */
export const NUMERIC_SERIES_BUCKET_GAP = {
  /** Every sample in the bucket is NaN. */
  ALL_NAN: 1 << 3,
  /** At least one NaN occurs between the first and last finite samples. */
  INTERIOR: 1 << 1,
  /** The bucket begins with one or more NaNs. */
  LEADING: 1 << 0,
  /** The bucket ends with one or more NaNs. */
  TRAILING: 1 << 2,
} as const;

export interface DecimatedNumericSeries {
  /**
   * One bit mask per source bucket. The metadata remains explicit even
   * though representative NaNs are also emitted for current renderers.
   */
  readonly bucketGapMask: Uint8Array;
  readonly times: Float64Array;
  readonly values: Float64Array;
}

/**
 * Two finite extrema plus at most one representative gap on each side
 * and between them. First/last series endpoints are budgeted separately.
 */
const MAX_BUCKET_OUTPUT_POINTS = NUMERIC_SERIES_MAX_BUCKET_SURVIVORS;

/**
 * Reduces parallel (times, values) arrays to at most `maxPoints`
 * entries. Each bucket contributes its finite minimum and maximum in
 * time order. NaN runs contribute explicit NaN points before, between,
 * or after those extrema, so a mixed bucket can never visually bridge a
 * real discontinuity. Multiple gaps separated only by discarded finite
 * samples are represented conservatively as one wider break.
 *
 * `bucketGapMask` durably distinguishes leading, interior, trailing,
 * and all-NaN buckets. Inputs at or under budget pass through unchanged,
 * but still receive one bucket mask. Finite point budgets are hard,
 * including budgets smaller than the normal bucket representation.
 */
export function decimateMinMax(
  times: Float64Array,
  values: Float64Array,
  maxPoints: number,
): DecimatedNumericSeries {
  const length = Math.min(times.length, values.length);
  if (!Number.isFinite(maxPoints)) {
    return passThrough(times, values, length);
  }

  const budget = Math.max(0, Math.floor(maxPoints));
  if (length <= budget) {
    return passThrough(times, values, length);
  }
  if (length === 0) {
    return emptyResult();
  }

  const endpointCount = Math.min(length, 2);
  const bucketCount = Math.floor(
    (budget - endpointCount) / MAX_BUCKET_OUTPUT_POINTS,
  );
  if (bucketCount < 1) {
    return summarizeWithinSmallBudget(times, values, length, budget);
  }

  const kept = new Set<number>([0, length - 1]);
  const bucketGapMask = new Uint8Array(bucketCount);
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor((bucket * length) / bucketCount);
    const end = Math.floor(((bucket + 1) * length) / bucketCount);
    const summary = summarizeBucket(values, start, end);
    bucketGapMask[bucket] = summary.gapMask;
    for (const index of summary.indexes) {
      kept.add(index);
    }
  }

  return materialize(
    times,
    values,
    [...kept].sort((a, b) => a - b),
    {
      bucketGapMask,
    },
  );
}

function passThrough(
  times: Float64Array,
  values: Float64Array,
  length: number,
): DecimatedNumericSeries {
  return {
    bucketGapMask:
      length === 0
        ? new Uint8Array(0)
        : Uint8Array.of(classifyBucketGaps(values, 0, length)),
    times: times.subarray(0, length),
    values: values.subarray(0, length),
  };
}

function emptyResult(
  bucketGapMask = new Uint8Array(0),
): DecimatedNumericSeries {
  return {
    bucketGapMask,
    times: new Float64Array(0),
    values: new Float64Array(0),
  };
}

/**
 * Tiny budgets cannot hold endpoints plus the worst-case bucket summary.
 * Collapse every discontinuity into one conservative break and retain only
 * finite samples before the first gap and after the last gap. This may omit
 * real finite detail, but it never invents continuity.
 */
function summarizeWithinSmallBudget(
  times: Float64Array,
  values: Float64Array,
  length: number,
  budget: number,
): DecimatedNumericSeries {
  const gapMask = classifyBucketGaps(values, 0, length);
  const bucketGapMask = Uint8Array.of(gapMask);
  if (budget === 0) {
    return emptyResult(bucketGapMask);
  }

  const firstNaN = findNaN(values, 0, length);
  const candidates: { readonly index: number; readonly priority: number }[] =
    [];
  if (firstNaN === -1) {
    candidates.push({ index: 0, priority: 0 });
    if (length > 1) candidates.push({ index: length - 1, priority: 0 });
    for (const index of finiteExtremaIndexes(values, 0, length)) {
      candidates.push({ index, priority: 1 });
    }
  } else {
    const lastNaN = findLastNaN(values, firstNaN, length);
    // The break wins the smallest budgets: a missing line is honest, while a
    // line connecting two retained endpoints across missing data is not.
    candidates.push({ index: firstNaN, priority: 0 });
    if (!Number.isNaN(values[0])) {
      candidates.push({ index: 0, priority: 1 });
    }
    if (!Number.isNaN(values[length - 1])) {
      candidates.push({ index: length - 1, priority: 1 });
    }
    for (const index of finiteExtremaIndexes(values, 0, firstNaN)) {
      candidates.push({ index, priority: 2 });
    }
    for (const index of finiteExtremaIndexes(values, lastNaN + 1, length)) {
      candidates.push({ index, priority: 2 });
    }
  }

  const selected = new Set<number>();
  candidates
    .sort((left, right) =>
      left.priority !== right.priority
        ? left.priority - right.priority
        : left.index - right.index,
    )
    .some(({ index }) => {
      selected.add(index);
      return selected.size >= budget;
    });

  return materialize(
    times,
    values,
    [...selected].sort((a, b) => a - b),
    { bucketGapMask },
  );
}

function summarizeBucket(
  values: Float64Array,
  start: number,
  end: number,
): { readonly gapMask: number; readonly indexes: readonly number[] } {
  const gapMask = classifyBucketGaps(values, start, end);
  const firstNaN = findNaN(values, start, end);
  if (firstNaN === -1) {
    return {
      gapMask,
      indexes: finiteExtremaIndexes(values, start, end),
    };
  }

  // Collapse every run from the first through the last NaN into one wider
  // break. Finite islands inside that interval are deliberately discarded:
  // retaining them without every surrounding break could invent continuity.
  const lastNaN = findLastNaN(values, firstNaN, end);
  return {
    gapMask,
    indexes: [
      ...finiteExtremaIndexes(values, start, firstNaN),
      firstNaN,
      ...finiteExtremaIndexes(values, lastNaN + 1, end),
    ],
  };
}

function classifyBucketGaps(
  values: Float64Array,
  start: number,
  end: number,
): number {
  let firstFinite = -1;
  let lastFinite = -1;
  for (let index = start; index < end; index += 1) {
    if (!Number.isNaN(values[index])) {
      if (firstFinite === -1) firstFinite = index;
      lastFinite = index;
    }
  }
  if (firstFinite === -1) {
    return end > start ? NUMERIC_SERIES_BUCKET_GAP.ALL_NAN : 0;
  }

  let mask = 0;
  if (firstFinite > start) mask |= NUMERIC_SERIES_BUCKET_GAP.LEADING;
  if (lastFinite < end - 1) mask |= NUMERIC_SERIES_BUCKET_GAP.TRAILING;
  if (findNaN(values, firstFinite + 1, lastFinite) !== -1) {
    mask |= NUMERIC_SERIES_BUCKET_GAP.INTERIOR;
  }
  return mask;
}

function finiteExtremaIndexes(
  values: Float64Array,
  start: number,
  end: number,
): number[] {
  let minIndex = -1;
  let maxIndex = -1;
  for (let index = start; index < end; index += 1) {
    const value = values[index];
    if (Number.isNaN(value)) continue;
    if (minIndex === -1 || value < values[minIndex]) minIndex = index;
    // Keep the last maximum on ties. Constant finite runs therefore retain
    // both temporal boundaries, improving the placement of gap markers.
    if (maxIndex === -1 || value >= values[maxIndex]) maxIndex = index;
  }
  if (minIndex === -1) return [];
  return minIndex === maxIndex
    ? [minIndex]
    : [minIndex, maxIndex].sort((left, right) => left - right);
}

function findNaN(values: Float64Array, start: number, end: number): number {
  for (let index = start; index < end; index += 1) {
    if (Number.isNaN(values[index])) return index;
  }
  return -1;
}

function findLastNaN(values: Float64Array, start: number, end: number): number {
  for (let index = end - 1; index >= start; index -= 1) {
    if (Number.isNaN(values[index])) return index;
  }
  return -1;
}

function materialize(
  times: Float64Array,
  values: Float64Array,
  indexes: readonly number[],
  metadata: { readonly bucketGapMask: Uint8Array },
): DecimatedNumericSeries {
  const outTimes = new Float64Array(indexes.length);
  const outValues = new Float64Array(indexes.length);
  for (let index = 0; index < indexes.length; index += 1) {
    outTimes[index] = times[indexes[index]];
    outValues[index] = values[indexes[index]];
  }
  return { ...metadata, times: outTimes, values: outValues };
}
