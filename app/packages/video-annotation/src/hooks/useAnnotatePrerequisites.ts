import type { ModalSample } from "@fiftyone/state";
import { resolveFrameCount } from "../utils/frameCount";
import { getModalSampleFrameRate } from "../utils/modalSample";

/** Why the annotate surface can't mount any media path. */
export type AnnotateBlocker = "metadata";

/** `ready` — the surface can resolve a decode strategy; `blocked` — a
 * `blocker` needs user action first. */
export type AnnotateStatus = "ready" | "blocked";

/**
 * Flat (not discriminated-union) shape: this codebase compiles with
 * `strict: false`, so `if (status === ...)` can't narrow a union — keep every
 * field accessible and switch on `status` at runtime. `blocker` is set iff
 * `status` is "blocked"; `frameRate`/`frameCount` are valid once metadata
 * resolves (i.e. when not blocked).
 */
export interface AnnotatePrerequisites {
  status: AnnotateStatus;
  blocker?: AnnotateBlocker;
  frameRate?: number;
  frameCount?: number;
}

/**
 * Resolve the one prerequisite every decode strategy needs up front: a
 * positive fps + a frame count (from `total_frame_count`, else
 * `duration * fps`). Absent when `VideoMetadata` wasn't computed → `metadata`
 * block, which the surface renders as an actionable prompt instead of mounting
 * a stream that would throw.
 *
 * Whether per-frame images were materialized is not a prerequisite: it's one
 * input to the decode-strategy resolver (fetch vs. extract vs. the `<video>`
 * tile), not a hard gate — see {@link useDecodeStrategy}.
 */
export const useAnnotatePrerequisites = (
  sample: ModalSample,
): AnnotatePrerequisites => {
  const frameRate = getModalSampleFrameRate(sample);
  const hasFrameRate =
    frameRate !== undefined && Number.isFinite(frameRate) && frameRate > 0;

  const frameCount = hasFrameRate
    ? (resolveFrameCount(sample, frameRate as number) ?? undefined)
    : undefined;

  const metadataOk = hasFrameRate && frameCount !== undefined;

  if (!metadataOk) {
    return { status: "blocked", blocker: "metadata" };
  }

  return { status: "ready", frameRate, frameCount };
};
