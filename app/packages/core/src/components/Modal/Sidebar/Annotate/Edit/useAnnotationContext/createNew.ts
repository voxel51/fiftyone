import type {
  ClassificationOptions,
  ClassificationOverlay,
  DetectionLabel,
  DetectionOverlayOptions,
  DetectionOverlay,
  PolylineLabel,
  PolylineOptions,
  PolylineOverlay,
} from "@fiftyone/lighter";
import { InteractiveDetectionHandler } from "@fiftyone/lighter";
import type { ClassificationLabel } from "@fiftyone/looker";
import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  objectId,
  POLYLINE,
} from "@fiftyone/utilities";
import { getDefaultStore } from "jotai";
import { isFieldReadOnly, labelSchemaData } from "../../state";
import { defaultField } from "./selectors";
import type { CreateDeps, CreateOptions, LabelType } from "./types";

/**
 * Build a new annotation label and attach its overlay to the scene.
 * Returns `null` when no schema field is available — caller handles the
 * AddSchema fallback. Does not touch editing/savedLabel atoms.
 */
export function createNewLabel(
  type: LabelType,
  options: CreateOptions | undefined,
  deps: CreateDeps,
): AnnotationLabel | null {
  const { scene, addOverlay, overlayFactory } = deps;
  const store = getDefaultStore();
  const id = options?.id ?? objectId();

  const field = options?.field ?? store.get(defaultField(type));
  if (!field) return null;

  const data = buildNewLabelData(field, type, {
    id,
    labelValue: options?.labelValue,
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
    return { data, overlay, path: field, type } as AnnotationLabel;
  }

  if (type === DETECTION) {
    const readOnly = isFieldReadOnly(store.get(labelSchemaData(field)));
    const overlay = overlayFactory.create<
      DetectionOverlayOptions,
      DetectionOverlay
    >("detection", {
      field,
      id,
      // Seed only; bbox etc. get populated by InteractiveDetectionHandler.
      label: data as unknown as DetectionLabel,
      draggable: !readOnly,
      resizeable: !readOnly,
    });
    addOverlay(overlay);
    scene?.enterInteractiveMode(new InteractiveDetectionHandler(overlay));
    return { data, overlay, path: field, type } as AnnotationLabel;
  }

  if (type === POLYLINE) {
    const polylineData = data as PolylineLabel;
    const overlay = overlayFactory.create<PolylineOptions, PolylineOverlay>(
      "polyline",
      { field, id, label: polylineData, selectable: true },
    );
    // withUndo=true so first-point placement is undoable.
    addOverlay(overlay, true);
    scene?.selectOverlay(id, { ignoreSideEffects: true });
    return {
      data: polylineData,
      overlay,
      path: field,
      type,
    } as AnnotationLabel;
  }

  return null;
}

/**
 * Build the initial label-data payload: schema-default → labelValue → first
 * class for `label`, per-attribute defaults, and polyline `points` seeded
 * from `origin`. Reused by selectors.ts when the user swaps a label's field.
 */
export function buildNewLabelData(
  field: string,
  type: LabelType,
  options?: CreateOptions,
) {
  const labelId = options?.id ?? objectId();
  const store = getDefaultStore();

  const fieldSchema = store.get(labelSchemaData(field));
  const labelSchema = fieldSchema?.label_schema;
  const defaults: Record<string, unknown> = {};
  const labelValue = options?.labelValue || labelSchema?.classes?.[0];

  if (labelSchema?.default !== undefined) {
    defaults.label = labelSchema.default;
  }

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
