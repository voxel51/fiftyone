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
  PolylineOptions,
  PolylineOverlay,
  decodeMaskPath,
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
    async (
      field: string,
      type: LabelType,
      data: AnnotationLabel["data"]
    ): Promise<AnnotationLabel> => {
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

        // Pre-decode `mask_path` masks.
        const preDecodedMask =
          !label?.mask && label?.mask_path
            ? await decodeMaskPath(label.mask_path, field, DETECTION)
            : undefined;

        const overlay = overlayFactory.create<
          DetectionOverlayOptions,
          DetectionOverlay
        >("detection", {
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
          preDecodedMask,
        });

        return { data, overlay, path: field, type };
      }

      if (type === POLYLINE) {
        const polylineLabel = data as PolylineLabel;

        const overlay = overlayFactory.create<PolylineOptions, PolylineOverlay>(
          "polyline",
          {
            id: data._id,
            field,
            label: polylineLabel as PolylineOptions["label"],
            draggable: false,
            deletable: false,
            selectable: true,
          }
        );

        return { data: polylineLabel, overlay, path: field, type };
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
