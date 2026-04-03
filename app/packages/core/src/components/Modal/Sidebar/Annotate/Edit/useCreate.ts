import type {
  BoundingBoxOptions,
  BoundingBoxOverlay,
  ClassificationOptions,
  ClassificationOverlay,
} from "@fiftyone/lighter";
import { InteractiveDetectionHandler, useLighter } from "@fiftyone/lighter";
import { ClassificationLabel, DetectionLabel } from "@fiftyone/looker";
import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  objectId,
  POLYLINE,
} from "@fiftyone/utilities";
import { useCallback } from "react";
import { useAddLabel, useSetSavedLabelData, useStartEditingLabel, useStartEditingType } from "../redux/hooks";
import type { AnnotationLabel as ReduxAnnotationLabel } from "../redux/annotationSlice";
import { selectDefaultField, selectFieldsOfType } from "../redux/annotationSlice";
import { annotationStore } from "../redux/store";
import type { LabelType } from "./state";

export interface CreateOptions {
  field?: string;
  labelValue?: string;
}

const useCreateAnnotationLabel = () => {
  const { scene, addOverlay, overlayFactory } = useLighter();

  return useCallback(
    (type: LabelType, options?: CreateOptions): AnnotationLabel | undefined => {
      const id = objectId();
      const state = annotationStore.getState();

      const field =
        options?.field ??
        selectDefaultField(type)(state);

      if (!field) {
        return undefined;
      }

      const labelValue = options?.labelValue;

      const fieldSchema = state.annotation.labelSchemasData?.[field];

      // Build label data with defaults and quick draw values (if applicable)
      const data = buildNewLabelData(field, type, id, labelValue);

      const isReadOnly = !!(
        fieldSchema?.label_schema?.read_only || fieldSchema?.read_only
      );

      if (type === CLASSIFICATION) {
        const overlay = overlayFactory.create<
          ClassificationOptions,
          ClassificationOverlay
        >("classification", {
          field,
          id,
          label: data as ClassificationLabel,
        });
        addOverlay(overlay);
        scene?.selectOverlay(id, { ignoreSideEffects: true });

        return { data, overlay, overlayId: id, path: field, type };
      }

      if (type === DETECTION) {
        const overlay = overlayFactory.create<
          BoundingBoxOptions,
          BoundingBoxOverlay
        >("bounding-box", {
          field,
          id,
          label: data as DetectionLabel,
          draggable: !isReadOnly,
          resizeable: !isReadOnly,
        });
        addOverlay(overlay);

        const handler = new InteractiveDetectionHandler(overlay);
        scene?.enterInteractiveMode(handler);
        return { data, overlay, overlayId: id, path: field, type };
      }

      return undefined;
    },
    [addOverlay, overlayFactory, scene]
  );
};

/**
 * Hook that returns a function to create a new annotation label.
 * @param type - The type of label to create (CLASSIFICATION, DETECTION, or POLYLINE)
 * @returns A function that creates the annotation label, optionally accepting
 *   a `field` and `labelValue` to override the defaults.
 */
export default function useCreate(type: LabelType) {
  const createAnnotationLabel = useCreateAnnotationLabel();
  const addLabel = useAddLabel();
  const startEditingLabel = useStartEditingLabel();
  const startEditingType = useStartEditingType();

  return useCallback(
    (options?: CreateOptions) => {
      const label = createAnnotationLabel(type, options);

      if (label) {
        const reduxLabel: ReduxAnnotationLabel = {
          id: label.data?._id ?? "unknown",
          overlayId: label.overlayId,
          path: label.path,
          type: label.type,
          cls: label.data?._cls ?? "",
          isNew: true,
          label: label.data?.label,
          confidence: label.data?.confidence,
          boundingBox: label.data?.bounding_box,
          data: label.data as unknown as Record<string, unknown>,
        };
        addLabel(reduxLabel);
        startEditingLabel(label.overlayId);
      } else {
        startEditingType(type);
      }
    },
    [createAnnotationLabel, addLabel, startEditingLabel, startEditingType, type]
  );
}

export function buildNewLabelData(
  field: string,
  type: LabelType,
  id?: string,
  label?: string
) {
  const labelId = id || objectId();

  // Extract default values from the label schema for new annotations
  const schemas = annotationStore.getState().annotation.labelSchemasData;
  const fieldSchema = schemas?.[field];
  const labelSchema = fieldSchema?.label_schema;
  const defaults: Record<string, unknown> = {};
  const labelValue = label || labelSchema?.classes?.[0];

  // Top-level default applies to the "label" value (e.g., default class)
  if (labelSchema?.default !== undefined) {
    defaults.label = labelSchema.default;
  }

  // Attribute-level defaults
  if (Array.isArray(labelSchema?.attributes)) {
    for (const attr of labelSchema.attributes) {
      if (attr.name && attr.default !== undefined) {
        defaults[attr.name] = attr.default;
      }
    }
  }

  const data = {
    _cls:
      type === CLASSIFICATION
        ? "Classification"
        : type === DETECTION
        ? "Detection"
        : undefined,
    _id: labelId,
    ...defaults,
    ...(labelValue && { label: labelValue }),
  };

  if (type === POLYLINE) {
    throw new Error("todo");
  }

  return data;
}
