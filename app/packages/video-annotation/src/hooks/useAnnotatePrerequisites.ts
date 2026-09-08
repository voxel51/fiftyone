import type { ModalSample } from "@fiftyone/state";
import { useIsImageDynamicGroupVideo } from "@fiftyone/state";
import {
  useDynamicGroupElementCount,
  useModalSampleFrameRate,
} from "../state/accessors";
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
  // An image dataset dynamically grouped into a video (ImaVid) has no
  // VideoMetadata: its frame rate falls back to the dataset's
  // `dynamic_groups_target_frame_rate` and its frame count is the group's
  // element count. Both hooks run unconditionally to keep hook order stable;
  // the count aggregation only mounts on the ImaVid path.
  const isImageDynamicGroupVideo = useIsImageDynamicGroupVideo();
  const imaVidFrameRate = useModalSampleFrameRate(sample);
  const elementCount = useDynamicGroupElementCount(isImageDynamicGroupVideo);

  if (isImageDynamicGroupVideo) {
    const ok =
      Number.isFinite(imaVidFrameRate) &&
      imaVidFrameRate > 0 &&
      elementCount !== null &&
      elementCount > 0;

    if (!ok) {
      return { status: "blocked", blocker: "metadata" };
    }

    return {
      status: "ready",
      frameRate: imaVidFrameRate,
      frameCount: elementCount,
    };
  }

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
