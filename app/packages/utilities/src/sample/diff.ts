import * as jsonpatch from "fast-json-patch";
import { JSONDeltas, JSONDeltaSupplier } from "../types";
import {
  GENERATED_SOURCE_LIST_CHILD,
  LabelData,
  LabelType,
  LIST_LABEL_CHILD,
} from "./labels";
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
  const child = LIST_LABEL_CHILD[type];

  if (child) {
    return listLabelDeltas(path, child, sourceValue, type, transientValue);
  }

  return supplierFor(type)(
    sourceValue,
    mergedForDiff(type, sourceValue, transientValue)
  ).map((d) => ({ ...d, path: buildJsonPath(path, d.path) }));
};

/**
 * List-label deltas, aligned by `_id` rather than array position, so a mid-list
 * delete or reorder emits a single `remove` (and never rewrites a sibling's
 * `_id`) instead of the index-aligned flood `jsonpatch.compare` produces. This
 * is the same shift-safe diff the per-frame video labels use — {@link
 * idAlignedListDelta} — now shared by every sample-level list label (detections,
 * temporal-detections, …).
 *
 * Special case: a freshly-created field whose source has no list child yet emits
 * one `add` of the whole merged wrapper, since the parent (`_cls`) must land
 * before any element-level path resolves.
 */
const listLabelDeltas = (
  path: string,
  child: string,
  sourceValue: unknown,
  type: LabelType,
  transientValue: unknown
): JSONDeltas => {
  const merged = mergedForDiff(type, sourceValue, transientValue) as Record<
    string,
    unknown
  >;
  const sourceList = (sourceValue as Record<string, unknown> | undefined)?.[
    child
  ];

  if (!Array.isArray(sourceList)) {
    return [
      {
        op: "add",
        path: buildJsonPath(path, ""),
        value: normalizeForCompare(merged) as never,
      },
    ];
  }

  const current = Array.isArray(merged[child])
    ? (merged[child] as LabelData[])
    : [];

  return idAlignedListDelta(current, sourceList as LabelData[], "", child).map(
    (d) => ({ ...d, path: buildJsonPath(path, d.path) })
  );
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

    // a patches view flattens the source list to a single label, so the
    // modal field type is the SINGLE kind — the source list child comes
    // from the generated mapping (the server resolves the label id inside
    // the source sample's list field)
    const child = isGenerated
      ? LIST_LABEL_CHILD[type] ?? GENERATED_SOURCE_LIST_CHILD[type]
      : undefined;

    return {
      labelId: changed.element._id,
      labelPath: child ? `${path}.${child}` : path,
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

/**
 * Resolve the delta supplier for a label type: every known label type diffs
 * structurally (the transient already carries the merged target state); only
 * the `Unknown` fallback (primitive / untyped fields) differs.
 */
export const supplierFor = (type: LabelType): JSONDeltaSupplier =>
  type === LabelType.Unknown ? unknownSupplier : structuralSupplier;

/**
 * Injected specifics for {@link idAlignedListDelta}. All optional — the
 * defaults cover the common label-list case (id = `_id`, structural diff of a
 * matched item, normalized whole-item add). Override per shape: temporal
 * detections key on a different id and remove via an explicit tombstone set.
 */
export interface IdAlignedDeltaSpec<TCurrent, TBaseline> {
  /** Stable id of a current (edited) item; items returning undefined are skipped. */
  currentId?: (item: TCurrent) => string | undefined;
  /** Stable id of a baseline (server) entry. */
  baselineId?: (entry: TBaseline) => string | undefined;
  /** Diff a matched item against its baseline entry; ops are rooted at `path`. */
  diffMatched?: (
    current: TCurrent,
    baseline: TBaseline,
    path: string
  ) => JSONDeltas;
  /** Serialize an unmatched item into an `add` value; return null to skip it. */
  serializeAdd?: (current: TCurrent) => unknown;
  /**
   * Ids to remove. Omit to remove baseline ids absent from `current`
   * (set-diff); supply explicitly when absence doesn't imply deletion.
   */
  removalIds?: Iterable<string>;
}

/**
 * Build a JSON-Patch delta for one label list, aligning edited `current` items
 * to the server `baseline` by id rather than by array position. Emits, under
 * `<containerPath>/<listChild>/...`: an `add` (`/-`) for current items with no
 * baseline match, in-place `diffMatched` ops for items on both sides (at their
 * baseline index), and `remove`s for removed ids in DESCENDING index order so an
 * earlier remove never shifts an index a later one references.
 *
 * Index-aligned diffing floods unappliable replaces when a list shifts (a
 * deleted slot slides every later slot down); id-alignment avoids that and stays
 * safe against baseline entries the client never saw. This is the shared shape
 * behind the per-frame video-label diff and the temporal-detection diff —
 * generalized over the list child so it serves any list-label field.
 */
export const idAlignedListDelta = <TCurrent = LabelData, TBaseline = LabelData>(
  current: readonly TCurrent[],
  baseline: readonly TBaseline[],
  containerPath: string,
  listChild: string,
  spec: IdAlignedDeltaSpec<TCurrent, TBaseline> = {}
): JSONDeltas => {
  const idOf = (item: unknown): string | undefined =>
    (item as { _id?: string } | undefined)?._id;
  const currentId = spec.currentId ?? idOf;
  const baselineId = spec.baselineId ?? idOf;
  const diffMatched =
    spec.diffMatched ??
    ((cur, base, path) =>
      // current/baseline are distinct generic params; the structural diff is
      // type-agnostic, so widen to a common type for the supplier call.
      structuralSupplier<unknown>(base, cur).map((op) => ({
        ...op,
        path: `${path}${op.path}`,
      })));
  const serializeAdd =
    spec.serializeAdd ?? ((cur: TCurrent) => normalizeForCompare(cur ?? {}));

  const listPath = `${containerPath}/${listChild}`;
  const baselineIndexById = new Map<string, number>();

  baseline.forEach((entry, index) => {
    const id = baselineId(entry);

    if (id !== undefined) {
      baselineIndexById.set(id, index);
    }
  });

  const ops: JSONDeltas = [];
  const currentIds = new Set<string>();

  for (const item of current) {
    const id = currentId(item);

    if (id === undefined) {
      continue;
    }

    currentIds.add(id);
    const index = baselineIndexById.get(id);

    if (index === undefined) {
      const value = serializeAdd(item);

      if (value === null || value === undefined) {
        continue;
      }

      ops.push({ op: "add", path: `${listPath}/-`, value: value as never });
      continue;
    }

    for (const op of diffMatched(
      item,
      baseline[index],
      `${listPath}/${index}`
    )) {
      ops.push(op);
    }
  }

  const removalIndices: number[] = [];

  if (spec.removalIds !== undefined) {
    for (const id of spec.removalIds) {
      const index = baselineIndexById.get(id);

      if (index !== undefined) {
        removalIndices.push(index);
      }
    }
  } else {
    baselineIndexById.forEach((index, id) => {
      if (!currentIds.has(id)) {
        removalIndices.push(index);
      }
    });
  }

  removalIndices.sort((a, b) => b - a);

  for (const index of removalIndices) {
    ops.push({ op: "remove", path: `${listPath}/${index}` });
  }

  return ops;
};
