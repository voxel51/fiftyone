import type { ModalSample } from "@fiftyone/state";
import { useMemo } from "react";
import { resolveFrameCount } from "../utils/frameCount";
import { getModalSampleFrameRate } from "../utils/modalSample";

/** Why the annotate surface can't mount its playback stream yet. */
export type AnnotateBlocker = "metadata";

/**
 * Flat (not discriminated-union) shape: this codebase compiles with
 * `strict: false`, so `if (!x.ok)` doesn't narrow a union — keep every field
 * accessible and lean on `ok` at runtime. `blocker` is set iff `ok` is false;
 * `frameRate`/`frameCount` are valid iff `ok` is true.
 */
export interface AnnotatePrerequisites {
  ok: boolean;
  blocker?: AnnotateBlocker;
  frameRate?: number;
  frameCount?: number;
}

/**
 * Resolve the inputs the ImaVid playback stream needs: a positive fps and a
 * frame count (from `total_frame_count`, else `duration * fps`). When the
 * sample's `VideoMetadata` wasn't computed, both are absent — report a
 * `metadata` blocker so the surface shows a prompt instead of throwing and
 * taking down the whole modal.
 */
export const useAnnotatePrerequisites = (
  sample: ModalSample
): AnnotatePrerequisites =>
  useMemo(() => {
    const frameRate = getModalSampleFrameRate(sample);
    if (
      frameRate === undefined ||
      !Number.isFinite(frameRate) ||
      frameRate <= 0
    ) {
      return { ok: false, blocker: "metadata" };
    }

    const frameCount = resolveFrameCount(sample, frameRate);
    if (frameCount === null) {
      return { ok: false, blocker: "metadata" };
    }

    return { ok: true, frameRate, frameCount };
  }, [sample]);
