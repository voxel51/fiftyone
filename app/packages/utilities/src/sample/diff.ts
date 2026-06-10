import * as jsonpatch from "fast-json-patch";
import { JSONDeltas, JSONDeltaSupplier } from "../types";
import { LabelData, LabelType, LIST_LABEL_CHILD } from "./labels";
import { equalsNormalized, normalizeForCompare } from "./normalize";
import { buildJsonPath, getNestedField } from "./pointer";

/**
 * Read-only view of a {@link Sample}'s state that the diff/reconcile functions
 * operate over. Passed by the class rather than reached into via `this`, and
 * `readonly`/`ReadonlySet`-typed so the engine provably cannot mutate Sample
 * state.
 */
export interface SampleSnapshot {
  readonly sourceData: Readonly<Record<string, unknown>>;
  readonly transientData: Readonly<Record<string, unknown>>;
  readonly transientDeletes: ReadonlySet<string>;
  /** Label type at a dot-delimited path (`Unknown` if not a label). */
  readonly getLabelType: (path: string) => LabelType;
  /** Resolve the delta supplier for a label type (encapsulates the Unknown fallback). */
  readonly getSupplier: (type: LabelType) => JSONDeltaSupplier;
}

/** A reference to an edited label, used to route generated-view persistence. */
export interface EditedLabel {
  labelId: string;
  labelPath: string;
}

/** A changed label element paired with its source counterpart (if any). */
interface ChangedElement {
  element: LabelData;
  source: LabelData | undefined;
}

/**
 * Build a JSON Patch (RFC 6902) describing all pending transient edits in the
 * snapshot. Each edited path's source value is diffed against its transient
 * value via the registered {@link JSONDeltaSupplier} for the field's label type.
 *
 * When `isGenerated` is true (patches / generated views), list-label edits are
 * emitted as a single-element diff rooted at the label (no parent-field prefix)
 * — the backend routes the patch onto the source sample via the
 * `{labelId, labelPath}` metadata from {@link firstEditedLabel}.
 */
export const buildJsonPatch = (
  snapshot: SampleSnapshot,
  opts: { isGenerated?: boolean } = {}
): JSONDeltas => {
  const { isGenerated = false } = opts;
  const deltas: JSONDeltas = [];

  for (const path of snapshot.transientDeletes) {
    const source = getNestedField(snapshot.sourceData, path);

    if (source === undefined) {
      continue;
    }

    deltas.push({ op: "remove", path: buildJsonPath(path, "") });
  }

  for (const [path, transientValue] of Object.entries(snapshot.transientData)) {
    const sourceValue = getNestedField(snapshot.sourceData, path);
    if (equalsNormalized(sourceValue, transientValue)) {
      continue;
    }

    const type = snapshot.getLabelType(path);

    if (isGenerated) {
      // Generated views persist onto a single source label, so emit only the
      // changed element's diff, rooted at the label (paths already start with
      // "/" from the structural supplier — no parent-field prefix).
      const changed = changedListElement(type, sourceValue, transientValue);

      if (changed) {
        deltas.push(
          ...structuralSupplier(
            changed.source,
            mergeLabel(changed.source, changed.element)
          )
        );
      }

      continue;
    }

    deltas.push(...fieldDeltas(snapshot, path, sourceValue, transientValue));
  }

  return deltas;
};

/**
 * Sample-rooted deltas for a single transient field path (non-generated shape).
 * Diffs the source value against the merge-then-diff target via the field's
 * registered {@link JSONDeltaSupplier}, prefixing each op with the field path.
 * Shared by {@link buildJsonPatch} and the reconcile no-op sweep.
 */
export const fieldDeltas = (
  snapshot: SampleSnapshot,
  path: string,
  sourceValue: unknown,
  transientValue: unknown
): JSONDeltas => {
  const type = snapshot.getLabelType(path);
  const supplier = snapshot.getSupplier(type);

  return supplier(
    sourceValue,
    mergedForDiff(type, sourceValue, transientValue)
  ).map((d) => ({ ...d, path: buildJsonPath(path, d.path) }));
};

/**
 * Return the first edited label across all pending transient entries, or
 * `undefined` if no label-shaped edits exist.
 *
 * For list-label fields, the first transient list element whose source
 * counterpart differs is returned. For single-label fields, the field's
 * resolved label is returned if it has changed.
 *
 * When `isGenerated` is true, the returned `labelPath` is adjusted to include
 * the list child key (e.g. `ground_truth.detections` rather than
 * `ground_truth`) so generated-view persistence can route the patch onto the
 * source sample.
 */
export const firstEditedLabel = (
  snapshot: SampleSnapshot,
  opts: { isGenerated?: boolean } = {}
): EditedLabel | undefined => {
  const { isGenerated = false } = opts;

  for (const [path, transientValue] of Object.entries(snapshot.transientData)) {
    const type = snapshot.getLabelType(path);
    const sourceValue = getNestedField(snapshot.sourceData, path);

    if (equalsNormalized(sourceValue, transientValue)) {
      continue;
    }

    const changed = changedListElement(type, sourceValue, transientValue);

    if (!changed?.element?._id) {
      continue;
    }

    const child = LIST_LABEL_CHILD[type];

    return {
      labelId: changed.element._id,
      labelPath: child && isGenerated ? `${path}.${child}` : path,
    };
  }

  return undefined;
};

/**
 * Locate the changed label element at a path, comparing transient vs. source.
 *
 * - For list-label fields, returns the first transient list element whose
 *   source counterpart (matched by `_id`) differs, along with that source
 *   counterpart (or `undefined` for a newly-added element).
 * - For single-label fields, returns the resolved transient label and its
 *   source value.
 *
 * Returns `undefined` if no changed element can be identified (e.g. the
 * transient value is not a well-formed list).
 */
const changedListElement = (
  type: LabelType,
  sourceValue: unknown,
  transientValue: unknown
): ChangedElement | undefined => {
  const child = LIST_LABEL_CHILD[type];

  if (!child) {
    // Single-label field: the transient value is the label itself.
    return {
      element: transientValue as LabelData,
      source: sourceValue as LabelData | undefined,
    };
  }

  const transientList = (
    transientValue as Record<string, unknown> | undefined
  )?.[child];
  if (!Array.isArray(transientList)) {
    return undefined;
  }

  const sourceById = labelsById(sourceValue, child);

  for (const label of transientList as LabelData[]) {
    if (!label?._id) {
      continue;
    }

    if (!equalsNormalized(label, sourceById.get(label._id))) {
      return { element: label, source: sourceById.get(label._id) };
    }
  }

  return undefined;
};

/**
 * Produce the value to diff against source for a label field, merging each
 * (partial) transient label over its current source counterpart so that
 * server-managed fields the partial omits (e.g. `tags`, `attributes`) are
 * preserved rather than emitted as `remove` ops. Mirrors the legacy supplier's
 * merge-then-diff behavior; without it, a label created before the server
 * assigns default fields would loop forever (remove → server re-adds default →
 * remove …). Non-label fields are diffed unchanged.
 *
 * The merge applies at both levels: each list element merges over its source
 * counterpart, and the list parent merges over the source parent so
 * server-managed *parent* fields the transient omits (e.g. `_cls` on a
 * freshly-created `Polylines` field) are likewise preserved.
 */
const mergedForDiff = (
  type: LabelType,
  sourceValue: unknown,
  transientValue: unknown
): unknown => {
  const child = LIST_LABEL_CHILD[type];

  if (child) {
    const transientList = (
      transientValue as Record<string, unknown> | undefined
    )?.[child];

    if (!Array.isArray(transientList)) {
      return transientValue;
    }

    const sourceById = labelsById(sourceValue, child);

    const merged = (transientList as LabelData[]).map((el) =>
      el?._id ? mergeLabel(sourceById.get(el._id), el) : el
    );

    return {
      ...((sourceValue ?? {}) as Record<string, unknown>),
      ...(transientValue as Record<string, unknown>),
      [child]: merged,
    };
  }

  if (type !== LabelType.Unknown) {
    // Single-label field.
    return mergeLabel(
      sourceValue as LabelData | undefined,
      transientValue as LabelData
    );
  }

  return transientValue;
};

/**
 * Index a list-label parent's elements by `_id`. Returns an empty map when the
 * value has no array at the child key.
 */
const labelsById = (
  parentValue: unknown,
  child: string
): Map<string, LabelData> => {
  const byId = new Map<string, LabelData>();
  const list = (parentValue as Record<string, unknown> | undefined)?.[child];
  if (Array.isArray(list)) {
    for (const l of list as LabelData[]) {
      if (l?._id) byId.set(l._id, l);
    }
  }
  return byId;
};

/**
 * Merge a partial label over its source counterpart, preserving server-managed
 * fields the partial omits. Returns the partial unchanged when there is no
 * source object to merge with (e.g. a newly-created label).
 */
export const mergeLabel = (
  source: LabelData | undefined,
  element: LabelData
): LabelData => {
  if (source && typeof source === "object" && !Array.isArray(source)) {
    return { ...source, ...element };
  }
  return element;
};

// ---- delta suppliers ----

/**
 * Structural diff for object/array-shaped values. Used for both single labels
 * (the transient already carries the merged target state) and list-label
 * parents (the transient already carries the upserted/filtered list).
 */
export const structuralSupplier: JSONDeltaSupplier = (a, b) => {
  const from = normalizeForCompare(a ?? {}) as
    | Record<string, unknown>
    | unknown[];
  const to = normalizeForCompare(b ?? {}) as
    | Record<string, unknown>
    | unknown[];

  return jsonpatch.compare(from, to);
};

/**
 * Fallback supplier for fields without a known label type. Handles both
 * primitive and object/array values.
 */
export const unknownSupplier: JSONDeltaSupplier = (a, b) => {
  if (equalsNormalized(a, b)) return [];

  // Re-evaluate object-ness *after* normalization so DateTime wrappers (which
  // collapse to ISO strings) are routed through the primitive branch below.
  const aNorm = normalizeForCompare(a);
  const bNorm = normalizeForCompare(b);
  const aIsObj = aNorm !== null && typeof aNorm === "object";
  const bIsObj = bNorm !== null && typeof bNorm === "object";

  if (aIsObj && bIsObj) {
    return jsonpatch.compare(
      aNorm as Record<string, unknown> | unknown[],
      bNorm as Record<string, unknown> | unknown[]
    );
  }

  if (bNorm === undefined || bNorm === null) {
    return aNorm === undefined ? [] : [{ op: "remove", path: "" }];
  }

  if (aNorm === undefined) {
    return [{ op: "add", path: "", value: bNorm as never }];
  }

  return [{ op: "replace", path: "", value: bNorm as never }];
};

export const defaultDeltaSuppliers = (): Record<
  LabelType,
  JSONDeltaSupplier
> => ({
  [LabelType.Classification]: structuralSupplier,
  [LabelType.Classifications]: structuralSupplier,
  [LabelType.Detection]: structuralSupplier,
  [LabelType.Detections]: structuralSupplier,
  [LabelType.Keypoint]: structuralSupplier,
  [LabelType.Keypoints]: structuralSupplier,
  [LabelType.Polyline]: structuralSupplier,
  [LabelType.Polylines]: structuralSupplier,
  [LabelType.Unknown]: unknownSupplier,
});
