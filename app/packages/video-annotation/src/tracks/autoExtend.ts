/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Frames a freshly-drawn box auto-extends forward as non-keyframe filler, so a
 * single drawn box immediately becomes a short track (matching a manual
 * drag-to-extend). Clamped at the clip end.
 */
export const AUTO_EXTEND_FRAMES = 30;

/**
 * The frames a fresh draw at `startFrame` should fill forward — `startFrame + 1`
 * through `startFrame + AUTO_EXTEND_FRAMES`, clamped to the inclusive clip
 * length `totalFrames`. Empty when the draw is already at (or past) the end.
 * Pure so the clamp/range is unit-testable; the hook applies it via the engine.
 */
export const autoExtendTargetFrames = (
  startFrame: number,
  totalFrames: number
): number[] => {
  const end = Math.min(startFrame + AUTO_EXTEND_FRAMES, totalFrames);
  const frames: number[] = [];

  for (let frame = startFrame + 1; frame <= end; frame++) {
    frames.push(frame);
  }

  return frames;
};
