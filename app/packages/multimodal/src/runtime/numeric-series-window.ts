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

import type { NsRange } from "../ir";
import { nsDeltaToSeconds } from "../utils/nanoseconds";
import type { TimelineIndex } from "./timeline-index";

export type { NsRange } from "../ir";

/** Width of the plot fetch horizon centered on the playhead. */
export const PLOT_WINDOW_SECONDS = 60;

/** Alignment quantum shared by follow-mode rendering and acquisition. */
export const PLOT_WINDOW_QUANTUM_SECONDS = 15;

/** Coverage sentinel for adapters without bounded numeric-series slices. */
export const FULL_NUMERIC_SERIES_COVERAGE: NsRange = {
  endNs: 1n << 62n,
  startNs: 0n,
};

const WINDOW_HALF_NS = BigInt(PLOT_WINDOW_SECONDS / 2) * 1_000_000_000n;
const WINDOW_QUANTUM_NS = BigInt(PLOT_WINDOW_QUANTUM_SECONDS) * 1_000_000_000n;
const FULL_RANGE_POINT_BUDGET = 4_000;
const MIN_WINDOW_POINT_BUDGET = 200;

/** Stable cache key for one stream and numeric field path. */
export function numericSeriesKey(stream: string, fieldPath: string): string {
  return `${stream}\0${fieldPath}`;
}

/** Parses a cache key minted by `numericSeriesKey`. */
export function splitNumericSeriesKey(
  key: string,
): [stream: string, fieldPath: string] {
  const separator = key.indexOf("\0");
  return [key.slice(0, separator), key.slice(separator + 1)];
}

/** Quantized, timeline-clamped numeric-series horizon for one playhead. */
export function quantizedNumericSeriesWindow(
  timeline: TimelineIndex,
  playheadSec: number,
): NsRange {
  const centerNs = timeline.secToNs(playheadSec);
  const rawStart = centerNs - WINDOW_HALF_NS;
  const rawEnd = centerNs + WINDOW_HALF_NS;
  const base = timeline.startTimeNs;
  const startOffset = rawStart > base ? rawStart - base : 0n;
  const endOffset = rawEnd > base ? rawEnd - base : 0n;
  const quantizedStart =
    base + (startOffset / WINDOW_QUANTUM_NS) * WINDOW_QUANTUM_NS;
  const quantizedEnd =
    base +
    ((endOffset + WINDOW_QUANTUM_NS - 1n) / WINDOW_QUANTUM_NS) *
      WINDOW_QUANTUM_NS -
    1n;
  const startNs = quantizedStart > base ? quantizedStart : base;
  const endNs =
    quantizedEnd < timeline.endTimeNs ? quantizedEnd : timeline.endTimeNs;
  return endNs >= startNs
    ? { endNs, startNs }
    : { endNs: timeline.endTimeNs, startNs: timeline.startTimeNs };
}

/** Missing range nearest the requested time, with deterministic tie breaks. */
export function nearestNumericSeriesRange(
  ranges: readonly NsRange[],
  preferredTimeNs: bigint,
): NsRange | undefined {
  return ranges.reduce<NsRange | undefined>((best, range) => {
    if (!best) return range;
    const distance = distanceToRange(range, preferredTimeNs);
    const bestDistance = distanceToRange(best, preferredTimeNs);
    if (distance !== bestDistance) {
      return distance < bestDistance ? range : best;
    }
    if (range.startNs !== best.startNs) {
      return range.startNs < best.startNs ? range : best;
    }
    return range.endNs < best.endNs ? range : best;
  }, undefined);
}

/** Whether two inclusive numeric-series ranges intersect. */
export function numericSeriesRangesOverlap(
  left: NsRange,
  right: NsRange,
): boolean {
  return left.startNs <= right.endNs && right.startNs <= left.endNs;
}

/** Seconds of `horizon` represented by the supplied covered ranges. */
export function coveredNumericSeriesSeconds(
  covered: readonly NsRange[],
  horizon: NsRange,
): number {
  let coveredNs = 0n;
  for (const range of covered) {
    const startNs =
      range.startNs > horizon.startNs ? range.startNs : horizon.startNs;
    const endNs = range.endNs < horizon.endNs ? range.endNs : horizon.endNs;
    if (endNs >= startNs) coveredNs += endNs - startNs;
  }
  return Number(coveredNs) / 1_000_000_000;
}

/** Duration of one inclusive numeric-series range in seconds. */
export function numericSeriesRangeDurationSeconds(range: NsRange): number {
  return Number(range.endNs - range.startNs) / 1_000_000_000;
}

/** Clips a decoded numeric field to one recording-time range. */
export function sliceNumericFieldToRange(
  field: {
    readonly timesSec: Float64Array;
    readonly values: Float64Array;
  },
  baseTimeNs: bigint,
  range: NsRange,
): { readonly timesSec: Float64Array; readonly values: Float64Array } {
  const startSec = nsDeltaToSeconds(range.startNs - baseTimeNs);
  const endSec = nsDeltaToSeconds(range.endNs - baseTimeNs);
  let start = 0;
  while (start < field.timesSec.length && field.timesSec[start] < startSec) {
    start += 1;
  }
  let end = start;
  while (end < field.timesSec.length && field.timesSec[end] <= endSec) {
    end += 1;
  }
  return {
    timesSec: field.timesSec.slice(start, end),
    values: field.values.slice(start, end),
  };
}

/** Point budget proportional to a requested window's recording share. */
export function numericSeriesWindowPointBudget(
  range: NsRange | null,
  durationSec: number | undefined,
): number {
  if (!range || !durationSec || durationSec <= 0) {
    return FULL_RANGE_POINT_BUDGET;
  }
  const rangeSec = Number(range.endNs - range.startNs) / 1_000_000_000;
  return Math.min(
    FULL_RANGE_POINT_BUDGET,
    Math.max(
      MIN_WINDOW_POINT_BUDGET,
      Math.round((FULL_RANGE_POINT_BUDGET * rangeSec) / durationSec),
    ),
  );
}

function distanceToRange(range: NsRange, preferredTimeNs: bigint): bigint {
  if (preferredTimeNs < range.startNs) {
    return range.startNs - preferredTimeNs;
  }
  if (preferredTimeNs > range.endNs) {
    return preferredTimeNs - range.endNs;
  }
  return 0n;
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
  return [
    ...result,
    ...covered.filter((existing) => existing.startNs > endNs + 1n),
  ];
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
  const mergedParts = [next];
  let mergedStartNs = next.startNs;
  let mergedEndNs = next.endNs;
  for (const segment of segments) {
    if (
      segment.endNs + 1n === mergedStartNs ||
      mergedEndNs + 1n === segment.startNs
    ) {
      mergedParts.push(segment);
      mergedStartNs =
        segment.startNs < mergedStartNs ? segment.startNs : mergedStartNs;
      mergedEndNs = segment.endNs > mergedEndNs ? segment.endNs : mergedEndNs;
    } else {
      result.push(segment);
    }
  }
  mergedParts.sort(compareByStartNs);
  result.push({
    endNs: mergedEndNs,
    startNs: mergedStartNs,
    timesSec: concatFloat64Parts(mergedParts.map((part) => part.timesSec)),
    values: concatFloat64Parts(mergedParts.map((part) => part.values)),
  });
  return result.sort(compareByStartNs);
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

  const separators = nonEmpty.reduce(
    (count, segment, index) =>
      index > 0 && nonEmpty[index - 1].endNs + 1n < segment.startNs
        ? count + 1
        : count,
    0,
  );
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
    const next = nonEmpty[index + 1];
    if (next && segment.endNs + 1n < next.startNs) {
      const previousLast = segment.timesSec[segment.timesSec.length - 1];
      const nextFirst = next.timesSec[0];
      timesSec[offset] = (previousLast + nextFirst) / 2;
      values[offset] = Number.NaN;
      offset += 1;
    }
  }
  return { timesSec, values };
}

function concatFloat64Parts(parts: readonly Float64Array[]): Float64Array {
  const result = new Float64Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function compareByStartNs(
  left: { readonly startNs: bigint },
  right: { readonly startNs: bigint },
): number {
  return left.startNs < right.startNs
    ? -1
    : left.startNs > right.startNs
      ? 1
      : 0;
}
