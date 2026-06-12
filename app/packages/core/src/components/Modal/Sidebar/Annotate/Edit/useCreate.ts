import type {
  DetectionOverlayOptions,
  DetectionOverlay,
  ClassificationOptions,
  ClassificationOverlay,
  PolylineLabel,
  PolylineOptions,
  PolylineOverlay,
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
import { defaultField, editing } from "./state";

export interface CreateOptions {
  id?: string;
  field?: string;
  labelValue?: string;
  /**
   * Relative-coordinate in the renderer indicating the origin of the creation.
   * This can be used to seed overlay creation.
   */
  origin?: [number, number];
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
        origin: options?.origin,
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
        return { data, overlay, path: field, type };
      }

      if (type === POLYLINE) {
        const polylineData = data as PolylineLabel;

        const overlay = overlayFactory.create<PolylineOptions, PolylineOverlay>(
          "polyline",
          {
            field,
            id,
            label: polylineData,
            selectable: true,
          }
        );
        // needs to pass in true, so that first point is undo-able. Otherwise, the overlay doesn't exist in the store until after the first point is placed, so the initial state isn't captured in the undo stack
        addOverlay(overlay, true);

        // Selecting the new overlay triggers `usePolylineMode`'s effect to
        // install an `InteractivePolylineHandler` for editing. Creation
        // itself doesn't `enterInteractiveMode` here.
        scene?.selectOverlay(id, { ignoreSideEffects: true });
        return { data: polylineData, overlay, path: field, type };
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
    (options?: CreateOptions): AnnotationLabel | null => {
      const label = createAnnotationLabel(type, options);

      if (label) {
        setEditing(
          atom<AnnotationLabel>({
            isNew: true,
            ...label,
          })
        );

        return label;
      } else {
        setEditing(type);
        return null;
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
        : type === POLYLINE
        ? "Polyline"
        : undefined,
    _id: labelId,
    ...defaults,
    ...(labelValue && { label: labelValue }),
  };

  if (type === POLYLINE) {
    return {
      closed: false,
      filled: false,
      ...data,
      points: options?.origin ? [[options.origin]] : [],
    };
  }

  return data;
}
