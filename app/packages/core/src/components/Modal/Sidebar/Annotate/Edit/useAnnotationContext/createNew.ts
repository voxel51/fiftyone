import type {
  ClassificationOptions,
  ClassificationOverlay,
  DetectionLabel,
  DetectionOverlayOptions,
  DetectionOverlay,
  KeypointLabel,
  KeypointOptions,
  KeypointOverlay,
  PolylineLabel,
  PolylineOptions,
  PolylineOverlay,
} from "@fiftyone/lighter";
import { InteractiveDetectionHandler } from "@fiftyone/lighter";
import type { ClassificationLabel } from "@fiftyone/looker";
import type { KeypointSkeleton } from "@fiftyone/looker/src/state";
import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  KEYPOINT,
  type LabelData,
  objectId,
  POLYLINE,
} from "@fiftyone/utilities";
import { getDefaultStore } from "jotai";
import { isFieldReadOnly, labelSchemaData } from "../../state";
import { defaultField } from "./selectors";
import type { CreateDeps, CreateOptions, LabelType } from "./types";

/**
 * Number of nodes a skeleton defines: the node-label count when labels are
 * present (they are optional in the SDK), otherwise inferred from the highest
 * edge index. Zero means the field is free-form.
 */
export const skeletonNodeCount = (
  skeleton: KeypointSkeleton | null,
): number => {
  if (!skeleton) return 0;
  if (skeleton.labels?.length) return skeleton.labels.length;
  if (skeleton.edges?.length) {
    return Math.max(...skeleton.edges.flat()) + 1;
  }
  return 0;
};

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

  if (type === KEYPOINT) {
    const readOnly = isFieldReadOnly(store.get(labelSchemaData(field)));
    const skeleton = deps.getSkeleton(field);
    const nodeCount = skeletonNodeCount(skeleton);

    // Skeleton fields are fixed-length: every node exists from the start as a
    // [NaN, NaN] hole and guided placement fills holes in node order, so a
    // node's index (= its identity) never changes. Free-form fields start
    // empty and grow point by point. Placement always flows through the
    // overlay's point API (movePointById / addPoint), whose events the engine
    // bridge commits — the engine upserts on the first placement, so an
    // abandoned draft (nothing placed) never reaches persistence.
    const points: [number, number][] = nodeCount
      ? Array.from({ length: nodeCount }, () => [NaN, NaN])
      : [];

    const keypointData = { ...data, points } as KeypointLabel;
    const overlay = overlayFactory.create<KeypointOptions, KeypointOverlay>(
      "keypoint",
      {
        field,
        id,
        label: keypointData,
        connections: skeleton?.edges ?? [],
        closed: false,
        draggable: !readOnly,
        // Skeleton nodes are cleared back to holes, never deleted — deleting
        // would shift indices and break node identity
        deletable: !readOnly && nodeCount === 0,
        selectable: true,
      },
    );
    addOverlay(overlay, true);
    scene?.selectOverlay(id, { ignoreSideEffects: true });

    return {
      data: keypointData,
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
            : type === KEYPOINT
              ? "Keypoint"
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

  if (type === KEYPOINT) {
    // Skeleton-aware seeding (holes per node) happens in createNewLabel,
    // where the skeleton is resolvable; this default covers other callers.
    return { ...data, points: [] };
  }

  return data;
}
