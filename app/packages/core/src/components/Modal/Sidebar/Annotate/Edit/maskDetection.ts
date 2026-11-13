import { DETECTION, DETECTIONS } from "@fiftyone/utilities";

/**
 * Whether `label` is a detection carrying a mask. A selected label's type is
 * its field's, so a detection in a `Detections` field reads as `Detections`.
 */
export const isMaskDetection = (
  label: { type?: string; data?: unknown } | null | undefined,
): boolean => {
  if (label?.type !== DETECTION && label?.type !== DETECTIONS) return false;
  const data = label.data as
    | { mask?: unknown; mask_path?: unknown }
    | undefined;
  return !!(data?.mask || data?.mask_path);
};
