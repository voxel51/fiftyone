import { HEATMAP } from "@fiftyone/utilities";

/**
 * Map the _id field to id
 */
export const mapId = (obj) => {
  if (obj && obj._id !== undefined) {
    obj.id = obj._id;
    obj._id = undefined;
  }
  return obj;
};

export const getOverlayFieldFromCls = (
  cls: string
):
  | { canonical: "map"; disk: "map_path" }
  | { canonical: "mask"; disk: "mask_path" } => {
  switch (cls) {
    case HEATMAP:
      return { canonical: "map", disk: "map_path" };
    default:
      return { canonical: "mask", disk: "mask_path" };
  }
};
