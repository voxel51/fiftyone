/**
 * Pure translation from a timeline interval drag on an object
 * track into the per-frame edit it implies. Kept free of React / stream
 * dependencies so it can be unit-tested directly; the command handlers in
 * `@fiftyone/annotation` carry out the resulting frame writes.
 *
 * Frame ↔ seconds mapping mirrors the one `buildPerInstanceTracks` uses in
 * the forward direction (`startSec = (firstFrame - 1) / fps`,
 * `endSec = lastFrame / fps`), inverted here.
 */

/** Drag mode reported by `TimelineTrack`'s `onEventEdit`. */
export type TrackDragMode = "resize-start" | "resize-end" | "move";

/**
 * Resolved per-frame edit for a track drag.
 * - `extend` — copy `sourceFrame`'s box onto each of `targetFrames` (the
 *   grown frames) as non-keyframe filler.
 * - `trim` — delete the track's detection on each of `frames` (the frames
 *   the drag pulled the edge past).
 * - `shift` — move the track's detection on each of `frames` by `delta`
 *   frames (rigid shift of the dragged segment).
 * - `none` — the drag resolved to no frame-level change.
 */
export type TrackExtentEdit =
  | { op: "extend"; sourceFrame: number; targetFrames: number[] }
  | { op: "trim"; frames: number[] }
  | { op: "shift"; frames: number[]; delta: number }
  | { op: "none" };

export interface ResolveTrackExtentEditInput {
  mode: TrackDragMode;
  /** Dragged segment's original bounds in seconds (the event's start/end). */
  origStartSec: number;
  origEndSec: number;
  /** Post-drag bounds in seconds (already snapped to frames by the track). */
  newStartSec: number;
  newEndSec: number;
  fps: number;
  /** 1-indexed inclusive clip length. Grown/shifted frames clamp to this. */
  totalFrames: number;
  /**
   * Other presence segments of the same track (the in-frame intervals
   * other than the dragged one), as `[firstFrame, lastFrame]` pairs. A
   * `move` is clamped so it can't overrun a neighbouring segment.
   */
  neighborSegments?: ReadonlyArray<readonly [number, number]>;
}

const firstFrameOf = (sec: number, fps: number): number =>
  Math.round(sec * fps) + 1;

const lastFrameOf = (sec: number, fps: number): number => Math.round(sec * fps);

const inclusiveRange = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let f = from; f <= to; f++) {
    out.push(f);
  }

  return out;
};

/**
 * Clamp a `move` delta so the shifted block `[first, last]` stays within
 * `[1, totalFrames]` and never overlaps a neighbouring segment of the same
 * track.
 */
const clampShift = (
  delta: number,
  first: number,
  last: number,
  totalFrames: number,
  neighbors: ReadonlyArray<readonly [number, number]>,
): number => {
  let lo = 1 - first; // first + delta >= 1
  let hi = totalFrames - last; // last + delta <= totalFrames

  for (const [nFirst, nLast] of neighbors) {
    if (nLast < first) {
      // Neighbour sits to the left: keep first + delta strictly past it.
      lo = Math.max(lo, nLast + 1 - first);
    } else if (nFirst > last) {
      // Neighbour sits to the right: keep last + delta strictly before it.
      hi = Math.min(hi, nFirst - 1 - last);
    }
  }

  return Math.max(lo, Math.min(hi, delta));
};

/**
 * Translate an interval drag into the per-frame edit it implies. Returns
 * `{ op: "none" }` for degenerate input (bad fps, zero-width segment) and
 * for drags that snapped back to the original extent.
 */
export function resolveTrackExtentEdit(
  input: ResolveTrackExtentEditInput,
): TrackExtentEdit {
  const { mode, fps, totalFrames } = input;
  if (!Number.isFinite(fps) || fps <= 0) {
    return { op: "none" };
  }

  const origFirst = firstFrameOf(input.origStartSec, fps);
  const origLast = lastFrameOf(input.origEndSec, fps);

  if (origLast < origFirst) {
    return { op: "none" };
  }

  if (mode === "resize-end") {
    const newLast = Math.min(
      Math.max(lastFrameOf(input.newEndSec, fps), origFirst),
      totalFrames,
    );

    if (newLast > origLast) {
      return {
        op: "extend",
        sourceFrame: origLast,
        targetFrames: inclusiveRange(origLast + 1, newLast),
      };
    }

    if (newLast < origLast) {
      return { op: "trim", frames: inclusiveRange(newLast + 1, origLast) };
    }

    return { op: "none" };
  }

  if (mode === "resize-start") {
    const newFirst = Math.max(
      Math.min(firstFrameOf(input.newStartSec, fps), origLast),
      1,
    );

    if (newFirst < origFirst) {
      return {
        op: "extend",
        sourceFrame: origFirst,
        targetFrames: inclusiveRange(newFirst, origFirst - 1),
      };
    }

    if (newFirst > origFirst) {
      return { op: "trim", frames: inclusiveRange(origFirst, newFirst - 1) };
    }

    return { op: "none" };
  }

  // move
  const delta = clampShift(
    firstFrameOf(input.newStartSec, fps) - origFirst,
    origFirst,
    origLast,
    totalFrames,
    input.neighborSegments ?? [],
  );

  if (delta === 0) {
    return { op: "none" };
  }

  return { op: "shift", frames: inclusiveRange(origFirst, origLast), delta };
}
