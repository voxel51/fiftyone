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
import { isDetection3dOverlay } from "@fiftyone/looker-3d";
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
      data: AnnotationLabel["data"],
      options?: {
        /**
         * Callback to resolve media URLs for a sub-field of this label
         * (e.g. `mask_path`).
         */
        resolveUrl?: (subField: string) => string | undefined;
        /**
         * When true, skip the `mask_path` pre-decode. Used by the refresh
         * path in `useLabels`, where the existing scene overlay is reused
         * and any newly-decoded mask would be discarded.
         */
        skipMaskDecode?: boolean;
      }
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

        // A 3D detection has no bounding_box, so the DetectionOverlay path
        // below would throw on boundingBox[0..3] and silently drop it. Return a
        // plain overlay stand-in instead (it renders via looker-3d). Guarded on
        // the missing bounding_box to leave every other detection untouched.
        if (!boundingBox && isDetection3dOverlay(data)) {
          return {
            data,
            overlay: {
              id: data._id,
              field,
              label: data,
              getLabel: () => ({ ...data }),
            },
            path: field,
            type,
          } as unknown as AnnotationLabel;
        }

        // Check if field is read-only
        const store = getDefaultStore();
        const fieldSchema = store.get(labelSchemaData(field));
        const isReadOnly = isFieldReadOnly(fieldSchema);

        // Pre-decode `mask_path` masks. The caller-provided resolver maps
        // the structural path to a fetchable URL; we don't fetch
        // `label.mask_path` directly because the raw value is not always
        // a fetchable URL on its own.
        const maskUrl = options?.skipMaskDecode
          ? undefined
          : options?.resolveUrl?.("mask_path");
        if (
          !options?.skipMaskDecode &&
          label?.mask_path &&
          !label?.mask &&
          !maskUrl
        ) {
          console.warn(
            `[mask-path] detection ${data._id} in field "${field}" has ` +
              "mask_path but the caller did not provide a resolvable URL"
          );
        }
        const preDecodedMask =
          !label?.mask && label?.mask_path && maskUrl
            ? await decodeMaskPath(maskUrl, field, DETECTION)
            : undefined;
        if (label?.mask_path && !label?.mask && maskUrl && !preDecodedMask) {
          console.warn(
            `[mask-path] decode failed for detection ${data._id} in field ` +
              `"${field}" (url=${maskUrl})`
          );
        }

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
