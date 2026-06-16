import { isDetection3d } from "@fiftyone/core/src/utils/labels";
import {
  extractNestedField,
  generateJsonPatch,
} from "@fiftyone/core/src/utils/json";
import type { KeypointLabel } from "@fiftyone/lighter";
import type { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import type { DetectionLabel } from "@fiftyone/looker/src/overlays/detection";
import type { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import type { PrimitiveValue, Sample } from "@fiftyone/state";
import { Field, isObject } from "@fiftyone/utilities";
import type { OpType } from "./types";
import { isPrimitiveFieldType } from "./util";

/**
 * Helper type representing a `fo.Polylines`-like element.
 */
export type PolylinesParent = {
  polylines: PolylineLabel[];
};

/**
 * Helper type representing a `fo.Keypoints`-like element.
 */
export type KeypointsParent = {
  keypoints: KeypointLabel[];
};

/**
 * Helper type representing a `fo.Detections`-like element.
 */
export type DetectionsParent = {
  detections: DetectionLabel[];
};

/**
 * Helper type representing a `fo.Classifications`-like element.
 */
export type ClassificationsParent = {
  classifications: ClassificationLabel[];
};

/**
 * Types of "native" labels which support delta calculation.
 */
type FieldType =
  | "Detection"
  | "Detections"
  | "Classification"
  | "Classifications"
  | "Polyline"
  | "Polylines"
  | "Keypoint"
  | "Keypoints";

const isFieldType = (field: Field, fieldType: FieldType): boolean => {
  return field?.embeddedDocType === `fiftyone.core.labels.${fieldType}`;
};

/**
 * Helper type encapsulating label metadata relevant to delta calculations.
 */
type LabelMetadata<T> = {
  type: Extract<
    FieldType,
    "Detection" | "Classification" | "Polyline" | "Keypoint"
  >;
  path: string;
  data: T;
};

/**
 * {@link LabelMetadata} detection subtype which includes a 2D bounding box.
 */
type Detection2DMetadata = LabelMetadata<DetectionLabel> & {
  type: "Detection";
  boundingBox: [number, number, number, number];
};

/**
 * Proxy type for an annotation label.
 *
 * This type represents a union of valid {@link LabelMetadata} variants.
 */
export type LabelProxy =
  | LabelMetadata<
      ClassificationLabel | DetectionLabel | PolylineLabel | KeypointLabel
    >
  | Detection2DMetadata
  | PrimitiveValue;

/**
 * A single label/field delta to persist: the value the editor started from
 * (``previousValue``) and the value to write (``newValue``), plus enough
 * addressing for the persistence layer to target the right collection(s).
 *
 *   - ``previousValue == null`` -> add
 *   - ``newValue == null``      -> delete
 *
 * The backend diffs ``previousValue`` vs ``newValue`` and writes only the
 * fields that changed, gated on their previous values.
 */
export type LabelFieldDelta = {
  /** Top-level field the label/value lives in, e.g. ``ground_truth``. */
  field: string;
  /** List key (``detections`` …) for a list label; ``null`` otherwise. */
  listKey: string | null;
  /** Label ``_id`` for a list element; ``null`` for a flat label/primitive. */
  labelId: string | null;
  previousValue: unknown;
  newValue: unknown;
};

const LABEL_TYPE_TO_LIST_KEY: Record<string, string> = {
  Detection: "detections",
  Classification: "classifications",
  Polyline: "polylines",
  Keypoint: "keypoints",
};

const listKeyForType = (type: string): string | null =>
  LABEL_TYPE_TO_LIST_KEY[type] ?? null;

const listKeyFor = (label: LabelProxy, schema: Field): string | null => {
  if (label.type === "Detection" && isFieldType(schema, "Detections")) {
    return "detections";
  }
  if (
    label.type === "Classification" &&
    isFieldType(schema, "Classifications")
  ) {
    return "classifications";
  }
  if (label.type === "Polyline" && isFieldType(schema, "Polylines")) {
    return "polylines";
  }
  if (label.type === "Keypoint" && isFieldType(schema, "Keypoints")) {
    return "keypoints";
  }
  return null;
};

/** Singular label ``_cls`` values, keyed by {@link LabelProxy} type. */
const LABEL_TYPE_TO_CLS: Record<string, string> = {
  Detection: "Detection",
  Classification: "Classification",
  Polyline: "Polyline",
  Keypoint: "Keypoint",
};

/**
 * The complete value of a label proxy, as a plain object (a 2D detection's
 * bounding box is folded into its data).
 *
 * Guarantees ``_cls`` on the value: for an existing label it is preserved via
 * the merge onto the previous value, but a newly-added label may reach here
 * without one (the overlay was created before its class was stamped), and a
 * label persisted without ``_cls`` cannot be deserialized back. Derive it
 * from the proxy type when absent; never overwrite an existing value.
 */
/**
 * Stamp the singular ``_cls`` for ``type`` onto a label object that lacks one;
 * never overwrites an existing ``_cls`` and leaves non-objects untouched.
 *
 * A label persisted (or sent as a save precondition) without ``_cls`` cannot
 * be deserialized server-side — it round-trips to a bare dict and the gated
 * write fails. Both the *new* value and the *previous* value (read raw from
 * the sample, which may have been written without ``_cls``) must carry it.
 */
const withCls = (value: unknown, type: string): unknown => {
  const cls = LABEL_TYPE_TO_CLS[type];
  if (cls && isObject(value) && !(value as { _cls?: unknown })._cls) {
    return { _cls: cls, ...(value as object) };
  }
  return value;
};

const incomingLabel = (label: LabelProxy): unknown => {
  const value =
    label.type === "Detection"
      ? makeDetectionLabel(label as Detection2DMetadata)
      : (label as { data: unknown }).data;

  return withCls(value, label.type);
};

/**
 * Merge the editor's fields over the original label so fields the editor
 * doesn't touch (e.g. server-enriched ``attributes``/``tags``/``_cls``) are
 * preserved — the backend then sees only the genuinely-changed fields.
 */
const mergeOntoPrevious = (previous: unknown, incoming: unknown): unknown =>
  isObject(previous) && isObject(incoming)
    ? { ...(previous as object), ...(incoming as object) }
    : incoming;

/**
 * Change *detection* (not delta computation): is the updated value materially
 * the same as the original? For objects we use a normalized comparison so
 * untouched labels (whose overlay representation may differ only by key order
 * or float formatting) don't register as edits and trigger phantom saves.
 */
export const isUnchanged = (previous: unknown, next: unknown): boolean => {
  if (isObject(previous) && isObject(next)) {
    return (
      generateJsonPatch(
        previous as Record<string, unknown>,
        next as Record<string, unknown>
      ).length === 0
    );
  }
  return previous === next || (previous == null && next == null);
};

/**
 * Build the {@link LabelFieldDelta} for a label edit, or `null` if it can't be
 * expressed (no schema / unknown type). Identifiers other than the field path
 * (collection, document id) are added by the persistence layer.
 *
 * In a generated (patches) view the source it must also update is a list, so
 * when ``isGenerated`` the source list key is derived from the label's type.
 * The modal sample itself may store the label flat (``to_patches``) or as a
 * list element (evaluation patches); the previous value is read from whichever
 * shape is actually present.
 *
 * @param sample Sample containing the original (pre-edit) label data
 * @param label Current label state
 * @param schema Field schema
 * @param opType Operation type ("mutate" or "delete")
 * @param isGenerated Whether this is a generated (patches) view
 * @param includeUnchanged Return the delta even when it is a no-op. Callers
 *   that record edits into the pending-edits store always record, and the
 *   store resolves no-ops — so e.g. an edit moved back to its starting value
 *   correctly supersedes the earlier recorded edit.
 */
export const buildLabelFieldDelta = (
  sample: Sample,
  label: LabelProxy,
  schema: Field,
  opType: OpType,
  isGenerated = false,
  includeUnchanged = false
): LabelFieldDelta | null => {
  const isDelete = opType === "delete";

  // `null` when the edit is a no-op (nothing actually changed / nothing to
  // delete) so unchanged labels never produce a save.
  const skip = (previousValue: unknown, newValue: unknown): boolean =>
    !includeUnchanged &&
    (isDelete ? previousValue == null : isUnchanged(previousValue, newValue));

  // Primitive (non-label) sample field.
  if (label.type === "Primitive" || isPrimitiveFieldType(schema)) {
    const path = label.path;
    const previousValue = extractNestedField(sample, path) ?? null;
    const newValue = isDelete ? null : (label as PrimitiveValue).data ?? null;
    if (skip(previousValue, newValue)) return null;
    return {
      field: path,
      listKey: null,
      labelId: null,
      previousValue,
      newValue,
    };
  }

  const labelId = (label as { data?: { _id?: string } }).data?._id ?? null;
  const listKey = isGenerated
    ? listKeyForType(label.type)
    : listKeyFor(label, schema);

  // Label inside a list field (e.g. ground_truth.detections). The modal sample
  // stores it either as a list element (normal view, evaluation patches) or
  // flattened to a single label (to_patches / to_clips) — read the previous
  // value from whichever shape is present.
  if (listKey) {
    const fieldValue = extractNestedField(sample, label.path);
    const list =
      isObject(fieldValue) &&
      Array.isArray((fieldValue as Record<string, unknown>)[listKey])
        ? ((fieldValue as Record<string, unknown>)[listKey] as Array<
            Record<string, unknown>
          >)
        : null;

    // The flat fallback must be THIS label (a to_patches sample IS the label,
    // matched by identity) — anything else at the field means the label has
    // no previous value. Using a foreign object as the precondition would
    // corrupt the save with another label's data.
    const flatValue =
      isObject(fieldValue) &&
      labelId !== null &&
      (fieldValue as { _id?: string })._id === labelId
        ? fieldValue
        : null;

    const previousValue = withCls(
      list
        ? list.find((e) => (e as { _id?: string })._id === labelId) ?? null
        : flatValue,
      label.type
    );

    const newValue = isDelete
      ? null
      : mergeOntoPrevious(previousValue, incomingLabel(label));
    if (skip(previousValue, newValue)) return null;
    return { field: label.path, listKey, labelId, previousValue, newValue };
  }

  // Flat single-label field (e.g. a top-level Classification field).
  const previousValue = withCls(
    extractNestedField(sample, label.path) ?? null,
    label.type
  );
  const newValue = isDelete
    ? null
    : mergeOntoPrevious(previousValue, incomingLabel(label));
  if (skip(previousValue, newValue)) return null;
  return {
    field: label.path,
    listKey: null,
    labelId: null,
    previousValue,
    newValue,
  };
};

/**
 * Create a {@link DetectionLabel} from a {@link LabelProxy} instance.
 *
 * @param label Source label
 */
const makeDetectionLabel = (
  label: LabelMetadata<DetectionLabel> | Detection2DMetadata
): DetectionLabel => {
  if (isDetection3d(label.data)) {
    return label.data;
  }

  const boundingBox = (label as Detection2DMetadata).boundingBox;

  return {
    ...label.data,
    bounding_box: [
      boundingBox[0] || 0,
      boundingBox[1] || 0,
      boundingBox[2] || 0,
      boundingBox[3] || 0,
    ],
  };
};
