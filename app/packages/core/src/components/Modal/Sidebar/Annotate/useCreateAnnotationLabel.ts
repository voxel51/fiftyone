import { useCallback } from "react";
import type { LabelType } from "./Edit/state";
import {
  CLASSIFICATION,
  DETECTION,
  KEYPOINT,
  POLYLINE,
} from "@fiftyone/utilities";
import {
  DetectionOverlayOptions,
  DetectionOverlay,
  ClassificationOptions,
  ClassificationOverlay,
  KeypointOptions,
  KeypointOverlay,
  useLighter,
} from "@fiftyone/lighter";
import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import { AnnotationLabel, useGetKeypointSkeleton } from "@fiftyone/state";
import { getDefaultStore } from "jotai";
import { isFieldReadOnly, labelSchemaData } from "./state";

/**
 * Hook which provides a method for creating an {@link AnnotationLabel}.
 */
export const useCreateAnnotationLabel = () => {
  const { overlayFactory } = useLighter();

  // Getter for resolving keypoint skeletons by field
  const getSkeletonForField = useGetKeypointSkeleton();

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

        return { data, overlay, path: field, type };
      }

      if (type === DETECTION) {
        const label = data as DetectionOverlayOptions["label"];
        const boundingBox = label?.bounding_box;

        // Check if field is read-only
        const store = getDefaultStore();
        const fieldSchema = store.get(labelSchemaData(field));
        const isReadOnly = isFieldReadOnly(fieldSchema);

        const overlay = overlayFactory.create<
          DetectionOverlayOptions,
          DetectionOverlay
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

        return { data, overlay, path: field, type };
      }

      if (type === POLYLINE) {
        return {
          data: data as PolylineLabel,
          overlay: {
            id: data._id,
            field,
            label: data as PolylineLabel,
          },
          type,
          path: field,
        };
      }

      if (type === KEYPOINT) {
        const fieldSkeleton = getSkeletonForField(field);

        const overlay = overlayFactory.create<KeypointOptions, KeypointOverlay>(
          "keypoint",
          {
            id: data._id,
            field,
            label: data as KeypointOptions["label"],
            connections: fieldSkeleton?.edges ?? [],
            closed: false,
            draggable: false,
            deletable: false,
            selectable: true,
          }
        );

        return { data, overlay, path: field, type };
      }

      throw new Error(`unable to create label of type '${type}'`);
    },
    [getSkeletonForField, overlayFactory]
  );
};
