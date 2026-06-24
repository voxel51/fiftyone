/** An inclusive `[startFrame, endFrame]` presence run (1-indexed). */
export type Segment = [number, number];

/**
 * Drop a sorted set of frame numbers from `segments`, splitting runs as needed.
 *
 * Bounded by the number of removed frames, never by run length — a removed
 * frame inside `[s, e]` splits it without ever enumerating the run. Frames
 * outside every segment are no-ops. `removeSorted` must be ascending.
 */
export function removeFrames(
  segments: readonly Segment[],
  removeSorted: readonly number[]
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
  presentSorted: readonly number[]
): Segment[] {
  const kept = removeFrames(baseline, dirtySorted);
  const added = presentSorted.map((frame): Segment => [frame, frame]);

  return coalesce([...kept, ...added]);
}
