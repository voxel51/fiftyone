/**
 * Min-max bucket decimation for numeric time series. Unlike uniform
 * stride (see `decimateTrajectory`), keeping each bucket's minimum and
 * maximum preserves spikes — the whole point of plotting telemetry.
 */

/**
 * Reduces parallel (times, values) arrays to at most `maxPoints`
 * entries. Each bucket contributes its min and max values in time
 * order; the first and last points always survive. `NaN` values mark
 * gaps: an all-NaN bucket contributes a single NaN point so the gap
 * survives decimation. Inputs at or under budget pass through
 * unchanged.
 */
export function decimateMinMax(
  times: Float64Array,
  values: Float64Array,
  maxPoints: number,
): { readonly times: Float64Array; readonly values: Float64Array } {
  const length = Math.min(times.length, values.length);
  if (
    !Number.isFinite(maxPoints) ||
    maxPoints < 4 ||
    length <= Math.max(4, maxPoints)
  ) {
    return {
      times: times.subarray(0, length),
      values: values.subarray(0, length),
    };
  }

  // Two survivors per bucket plus the forced endpoints.
  const bucketCount = Math.floor((maxPoints - 2) / 2);
  const kept = new Set<number>([0, length - 1]);
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor((bucket * length) / bucketCount);
    const end = Math.floor(((bucket + 1) * length) / bucketCount);
    let minIndex = -1;
    let maxIndex = -1;
    for (let index = start; index < end; index += 1) {
      const value = values[index];
      if (Number.isNaN(value)) {
        continue;
      }
      if (minIndex === -1 || value < values[minIndex]) {
        minIndex = index;
      }
      if (maxIndex === -1 || value > values[maxIndex]) {
        maxIndex = index;
      }
    }

    if (minIndex === -1) {
      if (end > start) {
        kept.add(start);
      }
      continue;
    }

    kept.add(minIndex);
    kept.add(maxIndex);
  }

  const indexes = [...kept].sort((a, b) => a - b);
  const outTimes = new Float64Array(indexes.length);
  const outValues = new Float64Array(indexes.length);
  for (let i = 0; i < indexes.length; i += 1) {
    outTimes[i] = times[indexes[i]];
    outValues[i] = values[indexes[i]];
  }

  return { times: outTimes, values: outValues };
}
