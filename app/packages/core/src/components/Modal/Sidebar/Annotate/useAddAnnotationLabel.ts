import type {
  BoundingBoxOptions,
  BoundingBoxOverlay,
  ClassificationOptions,
  ClassificationOverlay,
} from "@fiftyone/lighter";
import { useLighter } from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import { CLASSIFICATION, DETECTION } from "@fiftyone/utilities";
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
        const overlay = overlayFactory.create<
          BoundingBoxOptions,
          BoundingBoxOverlay
        >("bounding-box", {
          field,
          id: data._id,
          draggable: true,
          selectable: true,
          label: data,
          relativeBounds: {
            x: data.bounding_box[0],
            y: data.bounding_box[1],
            width: data.bounding_box[2],
            height: data.bounding_box[3],
          },
        });

        addOverlay(overlay);
        return { data, overlay, path: field, type };
      }

      throw new Error("E");
    },
    [addOverlay, overlayFactory]
  );
};
