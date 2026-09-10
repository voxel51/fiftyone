/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { frameAt, useCurrentTime } from "@fiftyone/playback";
import { useModalSample } from "@fiftyone/state";
import { useCallback, useRef } from "react";
import { useAnnotatePrerequisites } from "../hooks/useAnnotatePrerequisites";
import { useModalSampleFrameRate } from "./accessors";

/**
 * The single source of the current frame for the video surface's engine
 * integration, converting the committed playback time to a 1-indexed frame via
 * the shared `frameAt`. Clamped to the clip's real frame range, since the
 * playhead may rest at exactly `duration`, where an unclamped conversion
 * yields a nonexistent frame N+1.
 */
export const useCurrentFrame = (): number => {
  const sample = useModalSample();
  // the committed time, not the requested playhead: during a scrub the
  // request runs ahead while the picture holds the last ready frame, and
  // overlays and gesture frame-stamping must hold with it
  const time = useCurrentTime();
  const fps = useModalSampleFrameRate(sample);
  // undefined while the surface is blocked on metadata: the conversion then
  // runs unclamped, as there is no known last frame to clamp to
  const { frameCount } = useAnnotatePrerequisites(sample);

  if (!fps || !Number.isFinite(fps) || fps <= 0) {
    return -1;
  }

  return frameAt(time, fps, frameCount);
};

/**
 * A referentially-stable getter for the live frame — for the engine `Clock` and
 * gesture callbacks that must read the current frame imperatively without
 * re-subscribing on every tick.
 */
export const useCurrentFrameGetter = (): (() => number) => {
  const frame = useCurrentFrame();
  const ref = useRef(frame);
  ref.current = frame;

  return useCallback(() => ref.current, []);
};
