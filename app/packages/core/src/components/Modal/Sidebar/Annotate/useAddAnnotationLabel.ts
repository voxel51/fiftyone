import type {
  BoundingBoxOptions,
  BoundingBoxOverlay,
  ClassificationOptions,
  ClassificationOverlay,
} from "@fiftyone/lighter";
import { useLighter } from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import { CLASSIFICATION, DETECTION, POLYLINE } from "@fiftyone/utilities";
import { getDefaultStore } from "jotai";
import { useCallback } from "react";
import type { LabelType } from "./Edit/state";
import { labelSchemaData } from "./state";
import { useAddAnnotationLabel3dPolyline } from "./useAddAnnotationLabel3dPolyline";

export const useAddAnnotationLabel = () => {
  const { addOverlay, overlayFactory } = useLighter();
  const addAnnotationLabel3dPolyline = useAddAnnotationLabel3dPolyline();

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
          label: data,
        });
        addOverlay(overlay);
        return { data, overlay, path: field, type };
      }

      if (type === DETECTION) {
        const label = data as BoundingBoxOptions["label"];
        const boundingBox = label?.bounding_box;

        // Check if field is read-only
        const store = getDefaultStore();
        const fieldSchema = store.get(labelSchemaData(field));
        const isReadOnly = !!fieldSchema?.read_only;

        const overlay = overlayFactory.create<
          BoundingBoxOptions,
          BoundingBoxOverlay
        >("bounding-box", {
          field,
          id: data._id,
          draggable: !isReadOnly,
          resizeable: !isReadOnly,
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
        const result = addAnnotationLabel3dPolyline(field, type, data);
        if (result) {
          return result;
        }
      }

      throw new Error(`unable to create label of type '${type}'`);
    },
    [addOverlay, overlayFactory, addAnnotationLabel3dPolyline]
  );
};
