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
import type { AttributeConfig } from "../../SchemaManager/utils";
import { isFieldReadOnly, labelSchemaData } from "../../state";
import { resolveVisibleAttribute } from "../evaluateWhen";
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
      // starts empty; points are seeded through the point API below
      { field, id, label: { ...polylineData, points: [] }, selectable: true },
    );
    // withUndo=true so first-point placement is undoable.
    addOverlay(overlay, true);
    scene?.selectOverlay(id, { ignoreSideEffects: true });

    // The point API dispatches `lighter:keypoint-point-added`, which the
    // bridge commits to the engine. Points baked into the constructor are
    // never committed.
    for (const segment of polylineData.points ?? []) {
      const segmentIdx = overlay.startNewSegment();
      for (const point of segment) {
        overlay.appendPointToSegment(segmentIdx, point);
      }
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
 * Schema defaults for a new label in `field`: the schema-level `label`
 * default plus per-attribute defaults. Conditional (`when`) attributes only
 * contribute the default of the entry that owns the slot for the new label's
 * values (e.g. its class), so class-specific defaults land on the right class.
 *
 * Shared by the 2D create path ({@link buildNewLabelData}) and the 3D
 * cuboid/polyline create paths, which build their label data separately.
 */
export function getNewLabelDefaults(
  field: string,
  labelValue?: string,
): Record<string, unknown> {
  const labelSchema = getDefaultStore().get(
    labelSchemaData(field),
  )?.label_schema;
  const defaults: Record<string, unknown> = {};

  if (labelSchema?.default !== undefined) {
    defaults.label = labelSchema.default;
  }

  const attributes: AttributeConfig[] = Array.isArray(labelSchema?.attributes)
    ? labelSchema.attributes
    : [];

  for (const attr of attributes) {
    if (attr.name && !attr.when && attr.default !== undefined) {
      defaults[attr.name] = attr.default;
    }
  }

  // Resolve conditional owners against the values the label will be born
  // with, so `when: { field: "label", ... }` sees the new label's class.
  // Iterate to a fixed point so a conditional default can enable another
  // conditional attribute regardless of schema order; each pass recomputes
  // every owner, and the pass cap guards against cyclic conditions.
  const conditionalNames = new Set(
    attributes.filter((a) => a.name && a.when).map((a) => a.name),
  );
  let conditional: Record<string, unknown> = {};
  for (let pass = 0; pass <= conditionalNames.size; pass++) {
    const values = {
      ...defaults,
      ...conditional,
      ...(labelValue && { label: labelValue }),
    };
    const next: Record<string, unknown> = {};
    for (const name of conditionalNames) {
      const owner = resolveVisibleAttribute(name, attributes, values);
      if (owner?.default !== undefined) {
        next[name] = owner.default;
      }
    }

    const stable =
      Object.keys(next).length === Object.keys(conditional).length &&
      Object.entries(next).every(
        ([name, value]) => conditional[name] === value,
      );
    conditional = next;
    if (stable) break;
  }

  return { ...defaults, ...conditional };
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

  const labelSchema = store.get(labelSchemaData(field))?.label_schema;
  const labelValue = options?.labelValue || labelSchema?.classes?.[0];
  const defaults = getNewLabelDefaults(field, labelValue);

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
