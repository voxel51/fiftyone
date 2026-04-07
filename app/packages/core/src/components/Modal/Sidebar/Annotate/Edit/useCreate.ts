import type {
  DetectionOverlayOptions,
  DetectionOverlay,
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
import { atom, getDefaultStore, useSetAtom } from "jotai";
import { useCallback } from "react";
import { isFieldReadOnly, labelSchemaData } from "../state";
import type { LabelType } from "./state";
import { defaultField, editing, savedLabel } from "./state";

export interface CreateOptions {
  id?: string;
  field?: string;
  labelValue?: string;
  isEditingMask?: boolean;
}

const useCreateAnnotationLabel = () => {
  const { scene, addOverlay, overlayFactory } = useLighter();

  return useCallback(
    (type: LabelType, options?: CreateOptions): AnnotationLabel | undefined => {
      const id = objectId();
      const store = getDefaultStore();

      const field = options?.field ?? store.get(defaultField(type));

      if (!field) {
        return undefined;
      }

      const labelValue = options?.labelValue;

      // Extract default values from the label schema for new annotations
      const fieldSchema = store.get(labelSchemaData(field));

      // Build label data with defaults and detection/segmentation mode values (if applicable)
      const data = buildNewLabelData(field, type, {
        id,
        labelValue,
        isEditingMask: options?.isEditingMask,
      });

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
        store.set(savedLabel, data);

        return { data, overlay, path: field, type };
      }

      if (type === DETECTION) {
        const readOnly = isFieldReadOnly(fieldSchema);

        const overlay = overlayFactory.create<
          DetectionOverlayOptions,
          DetectionOverlay
        >("detection", {
          field,
          id,
          label: data as DetectionLabel,
          draggable: !readOnly,
          resizeable: !readOnly,
        });
        addOverlay(overlay);

        const handler = new InteractiveDetectionHandler(overlay);
        scene?.enterInteractiveMode(handler);
        store.set(savedLabel, data);
        return { data, overlay, path: field, type };
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
  const setEditing = useSetAtom(editing);
  const createAnnotationLabel = useCreateAnnotationLabel();

  return useCallback(
    (options?: CreateOptions) => {
      const label = createAnnotationLabel(type, options);

      if (label) {
        setEditing(
          atom<AnnotationLabel>({
            isNew: true,
            ...label,
          })
        );
      } else {
        setEditing(type);
      }
    },
    [createAnnotationLabel, setEditing, type]
  );
}

export function buildNewLabelData(
  field: string,
  type: LabelType,
  options?: CreateOptions
) {
  const labelId = options?.id ?? objectId();
  const store = getDefaultStore();

  // Extract default values from the label schema for new annotations
  const fieldSchema = store.get(labelSchemaData(field));
  const labelSchema = fieldSchema?.label_schema;
  const defaults: Record<string, unknown> = {};
  const labelValue = options?.labelValue || labelSchema?.classes?.[0];

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
    ...(options?.isEditingMask && { isEditingMask: true }),
  };

  if (type === POLYLINE) {
    throw new Error("todo");
  }

  return data;
}
