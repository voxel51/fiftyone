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

/**
 * The clip support of the modal sample — the 1-indexed, inclusive
 * `[first, last]` frame range of the parent video a `to_clips()` sample
 * covers — or `undefined` when the sample carries none.
 *
 * `support` is a field on the clip's sample document rather than on the
 * response envelope, and the document is typed as an open record, so this
 * validates the shape instead of trusting it: two finite, positive integers
 * in ascending order.
 */
export const getModalSampleSupport = (
  sample: ModalSample | null | undefined,
): readonly [number, number] | undefined => {
  const support = (sample?.sample as { support?: unknown } | undefined)
    ?.support;
  if (!Array.isArray(support) || support.length !== 2) {
    return undefined;
  }
  const [first, last] = support as unknown[];
  if (
    typeof first !== "number" ||
    typeof last !== "number" ||
    !Number.isInteger(first) ||
    !Number.isInteger(last) ||
    first < 1 ||
    last < first
  ) {
    return undefined;
  }
  return [first, last];
};
