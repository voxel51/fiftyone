import type {
  BaseOverlay,
  ClassificationOptions,
  ClassificationOverlay,
  DetectionLabel,
  DetectionOverlayOptions,
  DetectionOverlay,
  OverlayFactory,
  PolylineLabel,
  PolylineOptions,
  PolylineOverlay,
  Scene2D,
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
import { type LabelType } from "./atoms";
import { defaultField } from "./selectors";

export interface CreateOptions {
  id?: string;
  field?: string;
  labelValue?: string;
  /**
   * Polyline only: relative-coordinate of the first vertex. Ignored for
   * detection (geometry comes from InteractiveDetectionHandler) and
   * classification (no geometry).
   */
  origin?: [number, number];
}

export interface CreateDeps {
  scene: Scene2D | null;
  addOverlay: (overlay: BaseOverlay, withUndo?: boolean) => void;
  overlayFactory: OverlayFactory;
}

/**
 * Build a new annotation label of the given type and attach its overlay to
 * the scene. Returns the built label, or `null` when no schema field is
 * available — the caller is responsible for the AddSchema fallback.
 *
 * Pure with respect to Jotai: this function does not read or write any
 * annotation atoms. The caller owns `editing` and `savedLabel`.
 */
export function createNewLabel(
  type: LabelType,
  options: CreateOptions | undefined,
  deps: CreateDeps
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
      // buildNewLabelData returns a minimal seed; lighter's DetectionLabel
      // expects fields populated by the user (bbox, etc.) at create time.
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
      { field, id, label: polylineData, selectable: true }
    );
    // withUndo=true so the first-point placement is undoable; the overlay
    // otherwise wouldn't exist in the store until the first click lands.
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
 * Build the initial label data payload for a new label of the given type.
 *
 * Pulls default values from the label schema (top-level `default` and per-
 * attribute defaults), seeds `label` from `labelValue` or the first declared
 * class, and (for polylines) seeds the first vertex from `origin`.
 *
 * Exported so {@link currentField}'s field-swap writer in `state.ts` can
 * rebuild the data payload when the user reassigns a label's field.
 */
export function buildNewLabelData(
  field: string,
  type: LabelType,
  options?: CreateOptions
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
