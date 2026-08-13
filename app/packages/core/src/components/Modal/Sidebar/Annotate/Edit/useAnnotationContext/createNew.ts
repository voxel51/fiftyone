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
  type LabelData,
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
  const { scene, addOverlay, overlayFactory, engine, sample } = deps;
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

    // Persist the new Classification through to the engine immediately.
    // Classification has no draw gesture — there is no
    // `lighter:overlay-establish` to commit on, and the bridge is disabled on
    // video — so without this write the label would live only in the sidebar's
    // jotai draft (no engine row, no labels-list entry, no sample-document
    // mutation). Sample-level only by design (the toolbar's field picker
    // filters frame-level paths out, and the engine routes a sample-level path
    // to the sample-level store on video too).
    if (sample) {
      engine.updateLabel(
        { sample, path: field, instanceId: id },
        data as Partial<LabelData>,
      );
    }

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

    // Persist the new Polyline through to the engine immediately, for the same
    // reason Classification does above: a polyline is established by clicking
    // vertices, and `lighter:overlay-establish` only fires once the shape is
    // committed — so a single-vertex polyline had no engine row. It showed in
    // the sidebar (the jotai draft) and on the canvas (the overlay) while never
    // reaching the sample document, and only appeared once a second vertex
    // produced an edit commit. Delete was collateral damage: it relies on the
    // engine's delete tick to unmount the overlay, so with no row the row
    // vanished from the sidebar while the point stayed on the canvas.
    // Sample-level only, like the Classification write above: `CreateDeps` has
    // no `frame`, so a `frames.<field>` path would be addressed without one and
    // land in the wrong store. Video polyline tracks are established by the
    // video surface instead (see FOEPD-4459 — that path is still missing its
    // draw signal, so a video polyline currently persists on first edit).
    if (sample && !field.startsWith("frames.")) {
      engine.updateLabel(
        { sample, path: field, instanceId: id },
        polylineData as Partial<LabelData>,
      );
    }

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
