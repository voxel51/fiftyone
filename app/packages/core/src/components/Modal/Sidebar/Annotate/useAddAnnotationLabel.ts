import type {
  BoundingBoxOptions,
  BoundingBoxOverlay,
  ClassificationOptions,
  ClassificationOverlay,
} from "@fiftyone/lighter";
import { useLighter } from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import { CLASSIFICATION, DETECTION, POLYLINE } from "@fiftyone/utilities";
import { useCallback } from "react";
import type { LabelType } from "./Edit/state";

export const useAddAnnotationLabel = () => {
  const { addOverlay, overlayFactory } = useLighter();
  return useCallback(
    (
      field: string,
      type: LabelType,
      data: AnnotationLabel["data"]
    ): AnnotationLabel => {
      if (type === CLASSIFICATION) {
        const overlay = overlayFactory.create<
          ClassificationOptions,
          ClassificationOverlay
        >("classification", {
          field,
          id: data._id,
        });
        addOverlay(overlay);
        return { data, overlay, path: field, type };
      }

      if (type === DETECTION) {
        const label = data as BoundingBoxOptions["label"];
        const boundingBox = label?.bounding_box;
        const overlay = overlayFactory.create<
          BoundingBoxOptions,
          BoundingBoxOverlay
        >("bounding-box", {
          field,
          id: data._id,
          draggable: true,
          selectable: true,
          label,
          relativeBounds: {
            x: boundingBox[0],
            y: boundingBox[1],
            width: boundingBox[2],
            height: boundingBox[3],
          },
        });

        addOverlay(overlay);
        return { data, overlay, path: field, type };
      }

      if (type === POLYLINE) {
        throw new Error("todo");
      }

      throw new Error(`unable to create label of type '${type}'`);
    },
    [addOverlay, overlayFactory]
  );
};
