import type { ModalSample } from "@fiftyone/state";
import { resolveFrameCount } from "../utils/frameCount";
import { getModalSampleFrameRate } from "../utils/modalSample";
import { useSampledFramesProbe } from "./useSampledFramesProbe";

/** Why the annotate surface can't mount its playback stream. */
export type AnnotateBlocker = "metadata" | "frames";

/**
 * `checking` — still resolving a prerequisite (a `/frames` probe is in
 * flight); `ready` — the playback stream can mount; `blocked` — a `blocker`
 * needs user action first.
 */
export type AnnotateStatus = "checking" | "ready" | "blocked";

/**
 * Flat (not discriminated-union) shape: this codebase compiles with
 * `strict: false`, so `if (status === ...)` can't narrow a union — keep every
 * field accessible and switch on `status` at runtime. `blocker` is set iff
 * `status` is "blocked"; `frameRate`/`frameCount` are valid once metadata
 * resolves (i.e. for every status except a "metadata" block).
 */
export interface AnnotatePrerequisites {
  status: AnnotateStatus;
  blocker?: AnnotateBlocker;
  frameRate?: number;
  frameCount?: number;
}

/**
 * Resolve everything the ImaVid playback stream needs before it mounts:
 *
 * 1. a positive fps + a frame count (from `total_frame_count`, else
 *    `duration * fps`) — absent when `VideoMetadata` wasn't computed →
 *    `metadata` block;
 * 2. materialized per-frame images — absent when the video wasn't
 *    `to_frames(sample_frames=True)`'d → `frames` block.
 *
 * Reporting a block (instead of mounting + throwing/blank) lets the surface
 * show an actionable prompt. The frames probe only runs once metadata is
 * resolved, since it needs the frame count.
 */
export const useAnnotatePrerequisites = (
  sample: ModalSample
): AnnotatePrerequisites => {
  const frameRate = getModalSampleFrameRate(sample);
  const hasFrameRate =
    frameRate !== undefined && Number.isFinite(frameRate) && frameRate > 0;

  const frameCount = hasFrameRate
    ? resolveFrameCount(sample, frameRate as number) ?? undefined
    : undefined;

  const metadataOk = hasFrameRate && frameCount !== undefined;

  // Hooks can't be conditional — the probe always runs but no-ops (stays
  // "checking") until metadata resolves and enables it.
  const framesState = useSampledFramesProbe(frameCount, metadataOk);

  if (!metadataOk) {
    return { status: "blocked", blocker: "metadata" };
  }

  if (framesState === "checking") {
    return { status: "checking", frameRate, frameCount };
  }

  if (framesState === "unsampled") {
    return { status: "blocked", blocker: "frames", frameRate, frameCount };
  }

  return { status: "ready", frameRate, frameCount };
};
