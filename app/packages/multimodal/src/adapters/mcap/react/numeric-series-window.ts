/**
 * Coverage and segment bookkeeping for windowed numeric-series fetches.
 *
 * The plot fetches bounded playhead-anchored windows instead of whole
 * recordings; these helpers track which nanosecond ranges of a signal
 * are already fetched (so no range is ever fetched twice) and stitch
 * the fetched segments back into one chart-ready series.
 *
 * Ranges are inclusive on both ends, matching `readMessages` bounds.
 * Two ranges are "abutting" when one starts exactly 1ns after the
 * other ends — windowed requests are issued that way on purpose so
 * boundary messages are never fetched twice.
 */

/** Inclusive nanosecond range. */
export interface NsRange {
  readonly startNs: bigint;
  readonly endNs: bigint;
}

/** One fetched slice of a signal, tagged with the range it covers. */
export interface NumericSeriesSegment {
  readonly startNs: bigint;
  readonly endNs: bigint;
  /** Recording-relative seconds, ascending. */
  readonly timesSec: Float64Array;
  readonly values: Float64Array;
}

/**
 * Sub-ranges of `window` not yet covered. `covered` must be sorted,
 * disjoint, and non-abutting (the invariant `addCoveredRange` keeps).
 */
export function subtractCoveredRanges(
  window: NsRange,
  covered: readonly NsRange[],
): NsRange[] {
  const missing: NsRange[] = [];
  let cursor = window.startNs;
  for (const range of covered) {
    if (range.endNs < cursor) {
      continue;
    }
    if (range.startNs > window.endNs) {
      break;
    }
    if (range.startNs > cursor) {
      missing.push({ endNs: range.startNs - 1n, startNs: cursor });
    }
    cursor = range.endNs + 1n;
    if (cursor > window.endNs) {
      return missing;
    }
  }
  if (cursor <= window.endNs) {
    missing.push({ endNs: window.endNs, startNs: cursor });
  }
  return missing;
}

/**
 * Adds one range to a coverage list, merging overlapping and abutting
 * neighbors so the list stays sorted, disjoint, and non-abutting.
 */
export function addCoveredRange(
  covered: readonly NsRange[],
  range: NsRange,
): NsRange[] {
  let startNs = range.startNs;
  let endNs = range.endNs;
  const result: NsRange[] = [];
  for (const existing of covered) {
    if (existing.endNs + 1n < startNs) {
      result.push(existing);
      continue;
    }
    if (existing.startNs > endNs + 1n) {
      continue;
    }
    startNs = existing.startNs < startNs ? existing.startNs : startNs;
    endNs = existing.endNs > endNs ? existing.endNs : endNs;
  }
  result.push({ endNs, startNs });
  const trailing = covered.filter((existing) => existing.startNs > endNs + 1n);
  return [...result, ...trailing].sort((a, b) =>
    a.startNs < b.startNs ? -1 : a.startNs > b.startNs ? 1 : 0,
  );
}

/**
 * Removes one range from a coverage list (used to roll back the
 * optimistic coverage mark when a fetch fails).
 */
export function removeCoveredRange(
  covered: readonly NsRange[],
  range: NsRange,
): NsRange[] {
  const result: NsRange[] = [];
  for (const existing of covered) {
    if (existing.endNs < range.startNs || existing.startNs > range.endNs) {
      result.push(existing);
      continue;
    }
    if (existing.startNs < range.startNs) {
      result.push({ endNs: range.startNs - 1n, startNs: existing.startNs });
    }
    if (existing.endNs > range.endNs) {
      result.push({ endNs: existing.endNs, startNs: range.endNs + 1n });
    }
  }
  return result;
}

/**
 * Inserts a fetched segment, keeping segments sorted by range and
 * concatenating with neighbors whose covered ranges abut — continuous
 * playback grows one segment instead of accumulating hundreds.
 */
export function insertSeriesSegment(
  segments: readonly NumericSeriesSegment[],
  next: NumericSeriesSegment,
): NumericSeriesSegment[] {
  const result: NumericSeriesSegment[] = [];
  let merged = next;
  for (const segment of segments) {
    if (segment.endNs + 1n === merged.startNs) {
      merged = {
        endNs: merged.endNs,
        startNs: segment.startNs,
        timesSec: concatFloat64(segment.timesSec, merged.timesSec),
        values: concatFloat64(segment.values, merged.values),
      };
    } else if (merged.endNs + 1n === segment.startNs) {
      merged = {
        endNs: segment.endNs,
        startNs: merged.startNs,
        timesSec: concatFloat64(merged.timesSec, segment.timesSec),
        values: concatFloat64(merged.values, segment.values),
      };
    } else {
      result.push(segment);
    }
  }
  result.push(merged);
  return result.sort((a, b) =>
    a.startNs < b.startNs ? -1 : a.startNs > b.startNs ? 1 : 0,
  );
}

/**
 * Flattens segments into one ascending series, inserting a NaN sample
 * between non-abutting segments so charts render the unfetched region
 * as a gap instead of a connecting line.
 */
export function flattenSeriesSegments(
  segments: readonly NumericSeriesSegment[],
): { readonly timesSec: Float64Array; readonly values: Float64Array } {
  const nonEmpty = segments.filter((segment) => segment.timesSec.length > 0);
  if (nonEmpty.length === 0) {
    return { timesSec: new Float64Array(0), values: new Float64Array(0) };
  }

  const separators = nonEmpty.length - 1;
  const total =
    nonEmpty.reduce((sum, segment) => sum + segment.timesSec.length, 0) +
    separators;
  const timesSec = new Float64Array(total);
  const values = new Float64Array(total);
  let offset = 0;
  for (let index = 0; index < nonEmpty.length; index += 1) {
    const segment = nonEmpty[index];
    timesSec.set(segment.timesSec, offset);
    values.set(segment.values, offset);
    offset += segment.timesSec.length;
    if (index < nonEmpty.length - 1) {
      const previousLast = segment.timesSec[segment.timesSec.length - 1];
      const nextFirst = nonEmpty[index + 1].timesSec[0];
      timesSec[offset] = (previousLast + nextFirst) / 2;
      values[offset] = Number.NaN;
      offset += 1;
    }
  }
  return { timesSec, values };
}

function concatFloat64(a: Float64Array, b: Float64Array): Float64Array {
  const result = new Float64Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}
