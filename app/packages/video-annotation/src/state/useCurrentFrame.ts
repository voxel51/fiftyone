/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { frameAt, usePlayhead, usePresentedTime } from "@fiftyone/playback";
import { useModalSample } from "@fiftyone/state";
import { useCallback, useRef } from "react";
import { resolveFrameCount } from "../utils/frameCount";
import { useModalSampleFrameRate } from "./accessors";

/**
 * The single source of "current frame" for the engine integration on the video
 * surface.
 *
 * The surface drives playback through `PlaybackProvider` / `usePlaybackEngine`
 * (visible position = `usePlayhead()` seconds), NOT the legacy `useTimeline`
 * timeline-state machinery (which is never created here, so its frame number
 * stays frozen). Everything that needs the live frame — the engine clock,
 * the canvas bridge's `frameOf`, timeline select/hover frame-stamping — must
 * read it from here, converting the playhead seconds to a 1-indexed frame via
 * the shared `frameAt`.
 *
 * Clamped to the sample's real frame range: the engine allows the playhead to
 * rest at exactly `duration` (seek/step clamp inclusively), where an unclamped
 * conversion yields a nonexistent frame N+1 — no labels resolve there while
 * the renderer still shows the last frame.
 */
export const useCurrentFrame = (): number => {
  const sample = useModalSample();
  const playhead = usePlayhead();
  const presented = usePresentedTime();
  const fps = useModalSampleFrameRate(sample);

  if (!fps || !Number.isFinite(fps) || fps <= 0) {
    return -1;
  }

  // The frame actually on glass, when the tile publishes one — during a
  // scrub the picture can trail the requested playhead without bound
  // (browser seek pipeline, chunk fetch + decode), and every consumer of
  // "current frame" — overlay clock, TD gates, gesture frame-stamping —
  // should track what the user sees. The playhead is the fallback for
  // tiles that never present (no media, no vfc support).
  const time = presented ?? playhead;

  return frameAt(time, fps, resolveFrameCount(sample, fps) ?? undefined);
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
