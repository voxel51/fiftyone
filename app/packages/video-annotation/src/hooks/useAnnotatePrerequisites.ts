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
 * Resolve the sample's positive fps and frame count (`total_frame_count`, else
 * `duration * fps`; the group's element count for an image dynamic group).
 * Either missing is a `metadata` block the surface renders as a prompt.
 */
export const useAnnotatePrerequisites = (
  sample: ModalSample,
): AnnotatePrerequisites => {
  // An image dataset grouped into a video has no VideoMetadata: its frame
  // rate is the dataset's target rate and its frame count is the group's
  // element count. Both hooks run unconditionally to keep hook order stable.
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
