/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Edit-list (`elst`) handling for the native decode path.
 *
 * An mp4 edit list tells players where in the stored media presentation
 * begins. Encoders commonly write one to absorb start-up latency, so the first
 * stored picture(s) sit before the presentation start. ffmpeg (and therefore
 * OpenCV, `to_frames`, and any downstream pipeline that decodes with them)
 * treats such samples as pre-roll: they are decoded for reference but never
 * emitted, and frame 1 is the first sample at or after the edit start. Frame
 * numbers written by Annotate must follow the same rule or they land one
 * frame off in every consumer's decode.
 *
 * Pure functions — no mp4box, no workers — so the rule is unit-testable.
 */

/** One `elst` entry as mp4box exposes it on `Track.edits`. */
export interface EditListEntry {
  /** Duration of the edit in the presentation, in movie timescale units. */
  segment_duration: number;
  /**
   * Media time where this edit starts, in track timescale units. `-1` marks an
   * empty edit (a gap in the presentation with no media).
   */
  media_time: number;
}

/**
 * Media time (track timescale units) at which presentation begins: the
 * `media_time` of the first non-empty edit, or `0` when there is no edit list.
 */
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

/** The composition timestamp of a sample, in track timescale units. */
export interface TimedSample {
  cts: number;
}

/**
 * The samples that receive frame numbers, in presentation order: every sample
 * whose composition time is at or after `start`, sorted ascending by `cts`.
 * Samples before `start` are pre-roll — decoded when a GOP needs them, never
 * numbered. Frame `n` is `presentedInOrder(...)[n - 1]`.
 */
export function presentedInOrder<T extends TimedSample>(
  samples: readonly T[],
  start: number,
): T[] {
  return samples.filter((s) => s.cts >= start).sort((a, b) => a.cts - b.cts);
}
