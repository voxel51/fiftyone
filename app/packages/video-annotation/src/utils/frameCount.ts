import type { ModalSample } from "@fiftyone/state";

/**
 * Total frame count from `sample.metadata`, or `null` when it can't be
 * resolved. The `Sample` TS type only declares `width / height / mime_type`,
 * but VideoMetadata persists `total_frame_count` and `duration` at runtime —
 * we loose-cast through.
 *
 * Returns `null` (never throws) when neither is usable: the caller shows a
 * "compute metadata" prompt instead of crashing the modal.
 */
export function resolveFrameCount(
  sample: ModalSample,
  frameRate: number,
): number | null {
  const metadata = (sample.sample as { metadata?: Record<string, unknown> })
    ?.metadata;

  const total = metadata?.total_frame_count;
  if (typeof total === "number" && Number.isFinite(total) && total > 0) {
    return Math.round(total);
  }

  const duration = metadata?.duration;
  if (
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
  ) {
    // Ceiling, not round: a partial trailing frame (duration not an exact
    // frame multiple) is still a real frame. The epsilon keeps float error
    // in `duration * frameRate` at an exact multiple from minting a frame
    // past the media — mirrors the engine's `lastFrameStart` guard.
    return Math.max(1, Math.ceil(duration * frameRate - 1e-6));
  }

  return null;
}
