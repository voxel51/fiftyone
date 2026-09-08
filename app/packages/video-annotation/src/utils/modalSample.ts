import type { ModalSample } from "@fiftyone/state";

/**
 * Frame rate of the modal sample, or `undefined`. `frameRate` exists only on
 * the video variant of the sample response; `ModalSample`'s `Omit`-over-union
 * shape erases it, so read it through this narrowing accessor rather than off
 * the union directly.
 */
export const getModalSampleFrameRate = (
  sample: ModalSample | null | undefined,
): number | undefined =>
  (sample as { frameRate?: number } | null | undefined)?.frameRate;
