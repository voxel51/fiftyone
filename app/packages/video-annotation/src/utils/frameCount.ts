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
    return Math.max(1, Math.round(duration * frameRate));
  }

  return null;
}
