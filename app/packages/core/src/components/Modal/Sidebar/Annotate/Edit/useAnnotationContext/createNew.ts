import type {
  BaseOverlay,
  ClassificationOptions,
  ClassificationOverlay,
  DetectionOverlayOptions,
  DetectionOverlay,
  OverlayFactory,
  PolylineLabel,
  PolylineOptions,
  PolylineOverlay,
  Scene2D,
} from "@fiftyone/lighter";
import { InteractiveDetectionHandler } from "@fiftyone/lighter";
import type {
  ClassificationLabel,
  DetectionLabel,
} from "@fiftyone/looker";
import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  objectId,
  POLYLINE,
} from "@fiftyone/utilities";
import { getDefaultStore } from "jotai";
import { isFieldReadOnly, labelSchemaData } from "../../state";
import { buildNewLabelData } from "../useCreate";
import { defaultField, type LabelType } from "../state";

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
      label: data as DetectionLabel,
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
