import { HEATMAP } from "@fiftyone/utilities";
import type { FrameSample, Sample } from "../state";

export const RENDER_STATUS_PENDING = "pending";
export const RENDER_STATUS_PAINTING = "painting";
export const RENDER_STATUS_PAINTED = "painted";
export const RENDER_STATUS_DECODED = "decoded";

export type DenseLabelRenderStatus =
  | null
  | typeof RENDER_STATUS_PENDING
  | typeof RENDER_STATUS_PAINTING
  | typeof RENDER_STATUS_PAINTED
  | typeof RENDER_STATUS_DECODED;

/**
 * Map the _id field to id
 */
export const mapId = (obj) => {
  if (obj && obj._id !== undefined) {
    obj.id = obj._id;
    delete obj._id;
  }
  return obj;
};

export const getOverlayFieldFromCls = (cls: string) => {
  switch (cls) {
    case HEATMAP:
      return { canonical: "map", disk: "map_path" };
    default:
      return { canonical: "mask", disk: "mask_path" };
  }
};

/**
 * A sample's frames. Only samples carry `frames` (a frame list); on a
 * FrameSample the key is absent, so this reads undefined.
 */
export const sampleFrames = (
  sample: Sample | FrameSample,
): FrameSample[] | undefined =>
  (sample as Partial<Pick<Sample, "frames">>).frames;

/** A sample's media type; frames have none. */
export const sampleMediaType = (
  sample: Sample | FrameSample,
): Sample["_media_type"] | undefined =>
  (sample as Partial<Pick<Sample, "_media_type">>)?._media_type;
