import { HEATMAP } from "@fiftyone/utilities";

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
