import { HEATMAP } from "@fiftyone/utilities";

export type DenseLabelRenderStatus =
  | null
  | "pending"
  | "painting"
  | "painted"
  | "decoded";

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
