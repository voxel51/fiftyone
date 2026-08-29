/** Maximum representatives retained by one aligned numeric-series bucket. */
export const ALIGNED_NUMERIC_BUCKET_MAX_POINTS = 6;

/** Numeric samples reduced onto an absolute-time bucket grid. */
export interface AggregatedNumericSeries {
  readonly timesSec: Float64Array;
  readonly values: Float64Array;
}

/** Returns the absolute bucket containing `timeNs`. */
export function numericSeriesBucketIndex(
  timeNs: bigint,
  bucketDurationNs: bigint,
): bigint {
  const quotient = timeNs / bucketDurationNs;
  return timeNs < 0n && timeNs % bucketDurationNs !== 0n
    ? quotient - 1n
    : quotient;
}

/**
 * Reduces sorted numeric samples into absolute-time-aligned M4 buckets.
 * Each bucket keeps its finite extrema before the first source gap and after
 * the last one. The gap endpoints collapse any intervening finite islands
 * into one conservative break. This six-point summary is associative:
 * aggregating page summaries produces the same result as aggregating their
 * raw samples in one pass.
 */
export function aggregateAlignedNumericSeries(
  timesSec: Float64Array,
  values: Float64Array,
  baseTimeNs: bigint,
  bucketDurationNs: bigint,
): AggregatedNumericSeries {
  if (bucketDurationNs <= 0n) {
    throw new Error("numeric series bucket duration must be positive");
  }
  const length = Math.min(timesSec.length, values.length);
  if (length === 0) {
    return {
      timesSec: new Float64Array(0),
      values: new Float64Array(0),
    };
  }

  const kept: number[] = [];
  let bucketStart = 0;
  let bucket: bigint | undefined = bucketIndex(
    timesSec[0],
    baseTimeNs,
    bucketDurationNs,
  );
  for (let index = 1; index <= length; index += 1) {
    const nextBucket =
      index < length
        ? bucketIndex(timesSec[index], baseTimeNs, bucketDurationNs)
        : undefined;
    if (nextBucket === bucket) continue;
    kept.push(...summarizeBucket(values, bucketStart, index));
    bucketStart = index;
    bucket = nextBucket;
  }

  const outTimes = new Float64Array(kept.length);
  const outValues = new Float64Array(kept.length);
  for (let index = 0; index < kept.length; index += 1) {
    outTimes[index] = timesSec[kept[index]];
    outValues[index] = values[kept[index]];
  }
  return { timesSec: outTimes, values: outValues };
}

function bucketIndex(
  timeSec: number,
  baseTimeNs: bigint,
  bucketDurationNs: bigint,
): bigint {
  const timeNs = baseTimeNs + BigInt(Math.round(timeSec * 1e9));
  return numericSeriesBucketIndex(timeNs, bucketDurationNs);
}

function summarizeBucket(
  values: Float64Array,
  start: number,
  end: number,
): readonly number[] {
  const firstNaN = findNaN(values, start, end);
  if (firstNaN === -1) {
    return finiteExtremaIndexes(values, start, end);
  }
  const lastNaN = findLastNaN(values, firstNaN, end);
  return [
    ...finiteExtremaIndexes(values, start, firstNaN),
    firstNaN,
    ...(lastNaN === firstNaN ? [] : [lastNaN]),
    ...finiteExtremaIndexes(values, lastNaN + 1, end),
  ];
}

function finiteExtremaIndexes(
  values: Float64Array,
  start: number,
  end: number,
): readonly number[] {
  let minIndex = -1;
  let maxIndex = -1;
  for (let index = start; index < end; index += 1) {
    const value = values[index];
    if (Number.isNaN(value)) continue;
    if (minIndex === -1 || value < values[minIndex]) minIndex = index;
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
