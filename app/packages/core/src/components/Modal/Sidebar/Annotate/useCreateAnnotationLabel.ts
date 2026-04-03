import { useCallback } from "react";
import type { LabelType } from "./Edit/state";
import { CLASSIFICATION, DETECTION, POLYLINE } from "@fiftyone/utilities";
import {
  BoundingBoxOptions,
  BoundingBoxOverlay,
  ClassificationOptions,
  ClassificationOverlay,
  useLighter,
} from "@fiftyone/lighter";
import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import { AnnotationLabel } from "@fiftyone/state";
import { annotationStore } from "./redux/store";

/**
 * Hook which provides a method for creating an {@link AnnotationLabel}.
 */
export const useCreateAnnotationLabel = () => {
  const { overlayFactory } = useLighter();

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

        return { data, overlay, overlayId: overlay.id, path: field, type };
      }

      if (type === DETECTION) {
        const label = data as BoundingBoxOptions["label"];
        const boundingBox = label?.bounding_box;

        const schemas = annotationStore.getState().annotation.labelSchemasData;
        const fieldSchema = schemas?.[field];
        const isReadOnly = !!(
          fieldSchema?.label_schema?.read_only || fieldSchema?.read_only
        );

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

        return { data, overlay, overlayId: overlay.id, path: field, type };
      }

      if (type === POLYLINE) {
        return {
          data: data as PolylineLabel,
          overlay: {
            id: data._id,
            field,
            label: data as PolylineLabel,
          },
          overlayId: data._id,
          type,
          path: field,
        };
      }

      throw new Error(`unable to create label of type '${type}'`);
    },
    [overlayFactory]
  );
};
