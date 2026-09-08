import { isEqual } from "lodash";

/** An inclusive `[startFrame, endFrame]` presence run (1-indexed). */
export type Segment = [number, number];

/** An inclusive `[startFrame, endFrame, value]` run of one attribute value. */
export type ValueRun = [number, number, unknown];

/**
 * Drop a sorted set of frame numbers from `segments`, splitting runs as needed.
 *
 * Bounded by the number of removed frames, never by run length — a removed
 * frame inside `[s, e]` splits it without ever enumerating the run. Frames
 * outside every segment are no-ops. `removeSorted` must be ascending.
 */
export function removeFrames(
  segments: readonly Segment[],
  removeSorted: readonly number[],
): Segment[] {
  if (removeSorted.length === 0) {
    return segments.map(([s, e]) => [s, e]);
  }

  const out: Segment[] = [];
  for (const [start, end] of segments) {
    let cursor = start;

    for (const frame of removeSorted) {
      if (frame < start || frame > end) {
        continue;
      }

      if (frame > cursor) {
        out.push([cursor, frame - 1]);
      }

      cursor = frame + 1;
    }

    if (cursor <= end) {
      out.push([cursor, end]);
    }
  }

  return out;
}

/**
 * Merge overlapping or adjacent runs into maximal segments. Adjacent means
 * touching by one frame (`[1,3]` + `[4,6]` → `[1,6]`), matching contiguous
 * presence. Input need not be sorted.
 */
export function coalesce(segments: readonly Segment[]): Segment[] {
  if (segments.length <= 1) {
    return segments.map(([s, e]) => [s, e]);
  }

  const sorted = segments.map(([s, e]): Segment => [s, e]);
  sorted.sort((a, b) => a[0] - b[0]);

  const out: Segment[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const [start, end] = sorted[i];

    if (start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
      continue;
    }

    out.push([start, end]);
  }

  return out;
}

/**
 * Reconcile a baseline against a small dirty-frame edit set: drop every dirty
 * frame from the baseline, then add back the frames the live overlay confirms
 * present. The result is the merged presence in segment space — bounded by the
 * dirty-frame count, with no whole-clip expansion.
 */
export function mergePresence(
  baseline: readonly Segment[],
  dirtySorted: readonly number[],
  presentSorted: readonly number[],
): Segment[] {
  const kept = removeFrames(baseline, dirtySorted);
  const added = presentSorted.map((frame): Segment => [frame, frame]);

  return coalesce([...kept, ...added]);
}

/**
 * Drop a sorted set of frames from valued runs, splitting runs as needed and
 * preserving each run's value. The value-carrying analog of {@link removeFrames}.
 */
function removeValueFrames(
  runs: readonly ValueRun[],
  removeSorted: readonly number[],
): ValueRun[] {
  if (removeSorted.length === 0) {
    return runs.map(([s, e, v]): ValueRun => [s, e, v]);
  }

  const out: ValueRun[] = [];
  for (const [start, end, value] of runs) {
    let cursor = start;

    for (const frame of removeSorted) {
      if (frame < start || frame > end) {
        continue;
      }

      if (frame > cursor) {
        out.push([cursor, frame - 1, value]);
      }

      cursor = frame + 1;
    }

    if (cursor <= end) {
      out.push([cursor, end, value]);
    }
  }

  return out;
}

/**
 * Merge runs that touch (by one frame) AND share a value into maximal runs.
 * Input need not be sorted. The value-carrying analog of {@link coalesce}: a
 * value change breaks a run even across contiguous frames.
 */
function coalesceValueRuns(runs: readonly ValueRun[]): ValueRun[] {
  if (runs.length <= 1) {
    return runs.map(([s, e, v]): ValueRun => [s, e, v]);
  }

  const sorted = runs.map(([s, e, v]): ValueRun => [s, e, v]);
  sorted.sort((a, b) => a[0] - b[0]);

  const out: ValueRun[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const [start, end, value] = sorted[i];

    if (start <= last[1] + 1 && isEqual(value, last[2])) {
      last[1] = Math.max(last[1], end);
      continue;
    }

    out.push([start, end, value]);
  }

  return out;
}

/**
 * Reconcile a baseline of attribute value runs against the dirty-frame overlay:
 * drop every dirty frame from the baseline (an edit/deletion supersedes it),
 * add back the live value the overlay holds at each present dirty frame, then
 * re-coalesce by contiguity AND equal value. The value-space analog of
 * {@link mergePresence} — bounded by the dirty-frame count, never the clip
 * length, so dynamic-attribute sub-tracks scale the same way presence does.
 */
export function mergeAttributeRuns(
  baseline: readonly ValueRun[],
  dirtySorted: readonly number[],
  dirtyValues: ReadonlyMap<number, unknown>,
): ValueRun[] {
  const kept = removeValueFrames(baseline, dirtySorted);
  const added: ValueRun[] = [];
  for (const [frame, value] of dirtyValues) {
    added.push([frame, frame, value]);
  }

  return coalesceValueRuns([...kept, ...added]);
}
