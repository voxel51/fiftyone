/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * mp4 edit-list (`elst`) numbering. Samples before the edit list's media start
 * are pre-roll: ffmpeg decodes them for reference and never emits them, so
 * frame 1 is the first sample at or after the start. `to_frames`, OpenCV, and
 * backend inference inherit that numbering; Annotate must match it.
 */

/** One `elst` entry, as mp4box exposes it on `Track.edits`. */
export interface EditListEntry {
  /** Movie timescale units. */
  segment_duration: number;
  /** Track timescale units; `-1` marks an empty edit. */
  media_time: number;
}

/** Media time where presentation begins: the first non-empty edit's `media_time`, else 0. */
export function presentationStart(
  edits: readonly EditListEntry[] | undefined,
): number {
  if (!edits) {
    return 0;
  }

  for (const edit of edits) {
    if (edit.media_time >= 0) {
      return edit.media_time;
    }
  }

  return 0;
}

/** Sample composition time, in track timescale units. */
export interface TimedSample {
  cts: number;
}

/** Samples at or after `start`, in presentation order. Frame `n` is element `n - 1`. */
export function presentedInOrder<T extends TimedSample>(
  samples: readonly T[],
  start: number,
): T[] {
  return samples.filter((s) => s.cts >= start).sort((a, b) => a.cts - b.cts);
}
