import * as jsonpatch from "fast-json-patch";
import { isEqual } from "lodash";
import { Field, getFieldInfo, Schema } from "./schema";
import { JSONDeltas, JSONDeltaSupplier } from "./types";

export enum LabelType {
  Classification = "Classification",
  Classifications = "Classifications",
  Detection = "Detection",
  Detections = "Detections",
  Keypoint = "Keypoint",
  Keypoints = "Keypoints",
  Polyline = "Polyline",
  Polylines = "Polylines",
  Unknown = "Unknown",
}

const LIST_LABEL_CHILD: Partial<Record<LabelType, string>> = {
  [LabelType.Classifications]: "classifications",
  [LabelType.Detections]: "detections",
  [LabelType.Keypoints]: "keypoints",
  [LabelType.Polylines]: "polylines",
};

const EMBEDDED_DOC_TYPE_TO_LABEL_TYPE: Record<string, LabelType> =
  Object.fromEntries(
    (Object.values(LabelType) as LabelType[])
      .filter((t) => t !== LabelType.Unknown)
      .map((t) => [`fiftyone.core.labels.${t}`, t])
  );

const isListLabelType = (type: LabelType): boolean => type in LIST_LABEL_CHILD;

/**
 * Label sub-fields whose persisted value is owned by the server: large /
 * out-of-band payloads the backend may re-encode or relocate on save (e.g. a
 * mask written to disk as `mask_path`, or a heatmap `map`/`map_path`).
 *
 * These are written into a transient edit once and, after a successful
 * persist, released from the transient by {@link Sample.reconcilePersisted} so
 * subsequent diffs defer to the server's stored value. This restores the
 * one-shot semantics of Lighter's `getPendingMask()` (consumed on first read):
 * without it, a value the server re-encodes/relocates on round-trip never
 * compares equal to the frozen transient copy and is re-emitted on every
 * autosave tick — an infinite save loop. Unlike the DateTime case, the
 * post-persist value is server-assigned and not computable client-side, so it
 * cannot be reconciled by `normalizeForCompare`. Extensible via
 * {@link SampleOptions.serverOwnedFields}.
 */
const DEFAULT_SERVER_OWNED_FIELDS = [
  "mask",
  "mask_path",
  "map",
  "map_path",
] as const;

/**
 * Minimal shape of a fiftyone label document.
 */
export type LabelData = {
  _id: string;
  _cls?: string;
  [key: string]: unknown;
};

/**
 * Constructor options for {@link Sample}.
 */
export type SampleOptions = {
  data?: Record<string, unknown>;
  schema?: Schema;
  /**
   * Override the delta supplier for one or more label types. Any types not
   * specified fall back to the built-in suppliers.
   */
  suppliers?: Partial<Record<LabelType, JSONDeltaSupplier>>;
  /**
   * Label sub-field names whose persisted value is server-owned and released
   * from the transient after a successful persist (see
   * {@link Sample.reconcilePersisted} and {@link DEFAULT_SERVER_OWNED_FIELDS}).
   * Defaults to `mask`/`mask_path`/`map`/`map_path`.
   */
  serverOwnedFields?: readonly string[];
};

/**
 * Represents a fiftyone sample.
 *
 * Maintains a server-sent source of truth `sourceData` while allowing for
 * client-side mutation via {@link setField}, {@link updateLabel}, and
 * {@link deleteLabel}. Pending mutations live in a separate transient store
 * and are preferred by {@link getResolved} and the semantic accessors.
 *
 * The transient store is keyed by dot-delimited field path. Each entry holds
 * the fully-resolved target value for that path — list-label upserts (e.g.
 * editing one element of a `Detections` field) reconstruct the parent
 * structure so {@link getJsonPatch} can emit a single structural diff per
 * edited field.
 */
export class Sample {
  private sourceData: Record<string, unknown> = {};
  private transientData: Record<string, unknown> = {};
  private transientDeletes: Set<string> = new Set();
  private schema: Schema = {};
  private deltaSuppliers: Record<LabelType, JSONDeltaSupplier>;
  private serverOwnedFields: Set<string>;
  private listeners: Set<() => void> = new Set();
  private version = 0;

  constructor(opts: SampleOptions = {}) {
    if (opts.data) {
      this.sourceData = opts.data;
    }

    if (opts.schema) {
      this.schema = opts.schema;
    }

    this.deltaSuppliers = {
      ...defaultDeltaSuppliers(),
      ...(opts.suppliers ?? {}),
    } as Record<LabelType, JSONDeltaSupplier>;

    this.serverOwnedFields = new Set(
      opts.serverOwnedFields ?? DEFAULT_SERVER_OWNED_FIELDS
    );
  }

  // ---- subscriptions ----

  /**
   * Subscribe to mutations. The listener is invoked after every state change.
   * Returns an unsubscribe function. Designed to feed `useSyncExternalStore`.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Monotonically-increasing version counter, bumped on every state change.
   * Stable across no-op calls; suitable as a `getSnapshot` for
   * `useSyncExternalStore`.
   */
  getVersion = (): number => this.version;

  private notify(): void {
    this.version++;
    for (const listener of this.listeners) {
      listener();
    }
  }

  // ---- source data / schema ----

  setData(data: Record<string, unknown>): void {
    this.sourceData = data;
    this.gc();
    this.notify();
  }

  getData(): Record<string, unknown> {
    return this.sourceData;
  }

  setSchema(schema: Schema): void {
    this.schema = schema;
    this.notify();
  }

  getSchema(): Schema {
    return this.schema;
  }

  // ---- schema accessors ----

  /** Field schema info for a dot-delimited path, or undefined if absent. */
  getFieldInfo(path: string): Field | undefined {
    return getFieldInfo(path, this.schema);
  }

  /** LabelType of the field at the given path, or `Unknown` if not a label. */
  getLabelType(path: string): LabelType {
    return embeddedDocTypeToLabelType(this.getFieldInfo(path)?.embeddedDocType);
  }

  /** True if the field at the given path is a list label (e.g. Detections). */
  isListLabel(path: string): boolean {
    return isListLabelType(this.getLabelType(path));
  }

  // ---- raw read/write ----

  /**
   * Set a raw value at the given dot-delimited path. The value replaces any
   * prior transient value at the same path and clears any pending deletion.
   */
  setField<T>(path: string, data: T): void {
    this.transientData[path] = data;
    this.transientDeletes.delete(path);
    this.notify();
  }

  /**
   * Resolve the value at the given dot-delimited path, preferring transient
   * state over source data. Returns `undefined` when the path is unset or has
   * been deleted.
   */
  getResolved<T>(path: string): T | undefined {
    if (this.transientDeletes.has(path)) {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(this.transientData, path)) {
      return this.transientData[path] as T;
    }

    return (getNestedField<T>(this.transientData, path) ??
      getNestedField<T>(this.sourceData, path)) as T | undefined;
  }

  // ---- semantic accessors ----

  /**
   * Return the list of labels at a list-label path (e.g. Detections,
   * Classifications). Throws if the path does not refer to a list label.
   */
  listLabels(path: string): LabelData[] {
    const type = this.getLabelType(path);
    const child = LIST_LABEL_CHILD[type];

    if (!child) {
      throw new Error(`field at '${path}' is not a list label`);
    }

    const value = this.getResolved<Record<string, unknown>>(path);
    const list = value?.[child];

    return Array.isArray(list) ? (list as LabelData[]) : [];
  }

  /**
   * Get a single label.
   *
   * - For single labels (Classification, Detection, etc.), returns the label
   *   at `path`.
   * - For list labels, `id` is required and the matching element is returned.
   */
  getLabel(path: string, id?: string): LabelData | undefined {
    const type = this.getLabelType(path);

    if (isListLabelType(type)) {
      if (!id) {
        throw new Error(`id is required to get a label from list at '${path}'`);
      }

      return this.listLabels(path).find((l) => l._id === id);
    }

    return this.getResolved<LabelData>(path);
  }

  // ---- semantic mutators ----

  /**
   * Update a label at the given path.
   *
   * For single labels, the provided fields are merged with the existing label
   * so server-enriched properties (`_cls`, `_id`, `tags`, ...) are preserved
   * when only a partial update is supplied.
   *
   * For list labels, `data._id` is required and the label is upserted into
   * the parent list (merged with the prior element if one with the same `_id`
   * exists, otherwise appended).
   */
  updateLabel(path: string, data: Partial<LabelData>): void {
    const type = this.getLabelType(path);

    if (isListLabelType(type)) {
      if (!data._id) {
        throw new Error(`list label update at '${path}' requires an _id`);
      }

      const child = LIST_LABEL_CHILD[type]!;
      const existing =
        this.getResolved<Record<string, unknown>>(path) ??
        ({} as Record<string, unknown>);
      const prior = Array.isArray(existing[child])
        ? (existing[child] as LabelData[])
        : [];
      const next = [...prior];
      const idx = next.findIndex((l) => l._id === data._id);

      if (idx >= 0) {
        next.splice(idx, 1, { ...next[idx], ...data } as LabelData);
      } else {
        next.push(data as LabelData);
      }

      this.transientData[path] = { ...existing, [child]: next };
    } else {
      const existing = this.getResolved<LabelData>(path) ?? ({} as LabelData);
      this.transientData[path] = { ...existing, ...data };
    }

    this.transientDeletes.delete(path);
    this.notify();
  }

  /**
   * Add a label. For list labels this is an upsert by `_id`; for single
   * labels it behaves like {@link updateLabel}.
   */
  addLabel(path: string, data: LabelData): void {
    this.updateLabel(path, data);
  }

  /**
   * Mark a non-label field for deletion. The next {@link getJsonPatch} will
   * emit a `remove` op for it if the source has a value at this path.
   */
  deleteField(path: string): void {
    delete this.transientData[path];
    this.transientDeletes.add(path);
    this.notify();
  }

  /**
   * Delete a label at the given path.
   *
   * - For single labels, removes the field entirely (delegates to
   *   {@link deleteField}).
   * - For list labels, `id` is required and the matching element is removed
   *   from the parent list.
   */
  deleteLabel(path: string, id?: string): void {
    const type = this.getLabelType(path);

    if (isListLabelType(type)) {
      if (!id) {
        throw new Error(`list label deletion at '${path}' requires an id`);
      }
      const child = LIST_LABEL_CHILD[type]!;
      const existing = this.getResolved<Record<string, unknown>>(path);

      if (!existing) {
        return;
      }

      const prior = Array.isArray(existing[child])
        ? (existing[child] as LabelData[])
        : [];

      this.transientData[path] = {
        ...existing,
        [child]: prior.filter((l) => l._id !== id),
      };

      this.notify();

      return;
    }

    this.deleteField(path);
  }

  // ---- batch ops ----

  /** Drop all pending transient state. */
  clear(): void {
    this.transientData = {};
    this.transientDeletes.clear();
    this.notify();
  }

  /**
   * Build a JSON Patch (RFC 6902) describing all pending transient edits.
   * The patch is computed by diffing each edited path's source value against
   * its transient value via the registered {@link JSONDeltaSupplier} for the
   * field's label type.
   *
   * When `isGenerated` is true (patches / generated views), list-label edits
   * are emitted as a single-element diff rooted at the label (no parent-field
   * prefix) — the backend routes the patch onto the source sample via the
   * `{labelId, labelPath}` metadata from {@link firstEditedLabel}.
   */
  getJsonPatch(opts: { isGenerated?: boolean } = {}): JSONDeltas {
    const { isGenerated = false } = opts;
    const deltas: JSONDeltas = [];

    for (const path of this.transientDeletes) {
      const source = getNestedField(this.sourceData, path);

      if (source === undefined) {
        continue;
      }

      deltas.push({ op: "remove", path: buildJsonPath(path, "") });
    }

    for (const [path, transientValue] of Object.entries(this.transientData)) {
      const sourceValue = getNestedField(this.sourceData, path);
      if (equalsNormalized(sourceValue, transientValue)) {
        continue;
      }

      const type = this.getLabelType(path);

      if (isGenerated) {
        // Generated views persist onto a single source label, so emit only the
        // changed element's diff, rooted at the label (paths already start with
        // "/" from the structural supplier — no parent-field prefix).
        const changed = this.changedListElement(
          type,
          sourceValue,
          transientValue
        );

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

      deltas.push(...this.fieldDeltas(path, sourceValue, transientValue));
    }

    return deltas;
  }

  /**
   * Sample-rooted deltas for a single transient field path (non-generated
   * shape). Diffs the source value against the merge-then-diff target via the
   * field's registered {@link JSONDeltaSupplier}, prefixing each op with the
   * field path. Shared by {@link getJsonPatch} and {@link reconcilePersisted}.
   */
  private fieldDeltas(
    path: string,
    sourceValue: unknown,
    transientValue: unknown
  ): JSONDeltas {
    const type = this.getLabelType(path);
    const supplier =
      this.deltaSuppliers[type] ?? this.deltaSuppliers[LabelType.Unknown];

    return supplier(
      sourceValue,
      this.mergedForDiff(type, sourceValue, transientValue)
    ).map((d) => ({ ...d, path: buildJsonPath(path, d.path) }));
  }

  /**
   * Release server-owned fields (see {@link DEFAULT_SERVER_OWNED_FIELDS}) from
   * the transient after the given deltas have been successfully persisted.
   *
   * Each such field is write-once: once the server accepts it, the backend owns
   * the stored representation (which it may re-encode or relocate to a
   * `*_path`), so the transient must stop re-emitting it and defer to source on
   * the next hydration. Released by value (CAS): a field is dropped only if the
   * transient still holds the exact value that was persisted, so an edit made
   * after the patch was built (e.g. a re-paint while the request was in flight)
   * is preserved.
   *
   * Mirrors Lighter's one-shot `getPendingMask()`; call after a successful
   * persist. Generated-view deltas are label-rooted (no field-path prefix) and
   * match no transient key, so they are no-ops here.
   */
  reconcilePersisted(deltas: JSONDeltas): void {
    let mutated = false;

    for (const op of deltas) {
      if (op.op === "remove") {
        continue;
      }

      // A server-owned field may be the pointer leaf (`replace .../mask`) or
      // nested inside the op's value (`add .../detections/0` of a whole label),
      // so scan the value, not just the leaf.
      const baseSegments = op.path.split("/").filter(Boolean);
      const value = (op as { value?: unknown }).value;

      for (const target of this.serverOwnedTargets(baseSegments, value)) {
        const located = this.locateTransient(target.segments);
        if (!located) {
          continue;
        }

        const { path, rest } = located;
        const current = getAtPath(this.transientData[path], rest);
        if (!equalsNormalized(current, target.value)) {
          // Re-edited since the patch was built — keep the newer value.
          continue;
        }

        // Copy-on-write along the pointer: at success time the targeted
        // transient element may still be the same object reference as
        // `sourceData` (e.g. an un-edited list sibling), so an in-place delete
        // would corrupt source.
        this.transientData[path] = withoutPath(
          this.transientData[path],
          rest
        ) as Record<string, unknown>;
        mutated = true;
      }
    }

    if (!mutated) {
      return;
    }

    // Drop entries that no longer contribute a diff (e.g. a mask-only edit
    // whose sole changed field was just released).
    for (const path of Object.keys(this.transientData)) {
      const sourceValue = getNestedField(this.sourceData, path);
      if (
        this.fieldDeltas(path, sourceValue, this.transientData[path]).length ===
        0
      ) {
        delete this.transientData[path];
      }
    }

    this.notify();
  }

  /**
   * Enumerate every server-owned field reachable from a persisted op, as
   * `{ segments, value }` pairs where `segments` is the absolute pointer to the
   * field and `value` is the persisted value there. Covers both the pointer
   * leaf (`replace .../mask`) and fields nested within the op's value (a whole
   * label `add`). A server-owned value is treated as an opaque leaf payload —
   * recursion stops there.
   */
  private serverOwnedTargets(
    baseSegments: string[],
    value: unknown
  ): { segments: string[]; value: unknown }[] {
    const targets: { segments: string[]; value: unknown }[] = [];

    const visit = (segments: string[], val: unknown): void => {
      const leaf = segments[segments.length - 1];
      if (leaf !== undefined && this.serverOwnedFields.has(leaf)) {
        targets.push({ segments, value: val });
        return;
      }
      if (val && typeof val === "object") {
        for (const [key, child] of Object.entries(
          val as Record<string, unknown>
        )) {
          visit([...segments, key], child);
        }
      }
    };

    visit(baseSegments, value);

    return targets;
  }

  /**
   * Find the transient entry a sample-rooted JSON pointer addresses, returning
   * the transient key (dot path) and the remaining pointer segments into its
   * value. Picks the longest matching key prefix.
   */
  private locateTransient(
    segments: string[]
  ): { path: string; rest: string[] } | undefined {
    let best: { path: string; rest: string[] } | undefined;

    for (const path of Object.keys(this.transientData)) {
      const keySegs = path.split(".");
      if (keySegs.length >= segments.length) {
        continue;
      }
      if (!keySegs.every((s, i) => s === segments[i])) {
        continue;
      }
      if (!best || keySegs.length > best.path.split(".").length) {
        best = { path, rest: segments.slice(keySegs.length) };
      }
    }

    return best;
  }

  /**
   * Return the first edited label across all pending transient entries, or
   * `undefined` if no label-shaped edits exist.
   *
   * For list-label fields, the first transient list element whose source
   * counterpart differs is returned. For single-label fields, the field's
   * resolved label is returned if it has changed.
   *
   * When `isGenerated` is true, the returned `labelPath` is adjusted to
   * include the list child key (e.g. `ground_truth.detections` rather than
   * `ground_truth`) so generated-view persistence can route the patch onto
   * the source sample.
   */
  firstEditedLabel(
    opts: { isGenerated?: boolean } = {}
  ): { labelId: string; labelPath: string } | undefined {
    const { isGenerated = false } = opts;

    for (const [path, transientValue] of Object.entries(this.transientData)) {
      const type = this.getLabelType(path);
      const sourceValue = getNestedField(this.sourceData, path);

      if (equalsNormalized(sourceValue, transientValue)) {
        continue;
      }

      const changed = this.changedListElement(
        type,
        sourceValue,
        transientValue
      );

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
  }

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
  private changedListElement(
    type: LabelType,
    sourceValue: unknown,
    transientValue: unknown
  ): { element: LabelData; source: LabelData | undefined } | undefined {
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

    const sourceList = (sourceValue as Record<string, unknown> | undefined)?.[
      child
    ];
    const sourceById = new Map<string, LabelData>();
    if (Array.isArray(sourceList)) {
      for (const l of sourceList as LabelData[]) {
        if (l?._id) sourceById.set(l._id, l);
      }
    }

    for (const label of transientList as LabelData[]) {
      if (!label?._id) {
        continue;
      }

      if (!equalsNormalized(label, sourceById.get(label._id))) {
        return { element: label, source: sourceById.get(label._id) };
      }
    }

    return undefined;
  }

  /**
   * Produce the value to diff against source for a label field, merging each
   * (partial) transient label over its current source counterpart so that
   * server-managed fields the partial omits (e.g. `tags`, `attributes`) are
   * preserved rather than emitted as `remove` ops. Mirrors the legacy
   * supplier's merge-then-diff behavior; without it, a label created before
   * the server assigns default fields would loop forever (remove → server
   * re-adds default → remove …). Non-label fields are diffed unchanged.
   *
   * The merge applies at both levels: each list element merges over its source
   * counterpart, and the list parent merges over the source parent so
   * server-managed *parent* fields the transient omits (e.g. `_cls` on a
   * freshly-created `Polylines` field) are likewise preserved.
   */
  private mergedForDiff(
    type: LabelType,
    sourceValue: unknown,
    transientValue: unknown
  ): unknown {
    const child = LIST_LABEL_CHILD[type];

    if (child) {
      const transientList = (
        transientValue as Record<string, unknown> | undefined
      )?.[child];

      if (!Array.isArray(transientList)) {
        return transientValue;
      }

      const sourceById = new Map<string, LabelData>();
      const sourceList = (sourceValue as Record<string, unknown> | undefined)?.[
        child
      ];
      if (Array.isArray(sourceList)) {
        for (const l of sourceList as LabelData[]) {
          if (l?._id) sourceById.set(l._id, l);
        }
      }

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
  }

  /** Drop transient entries that have become no-ops vs. the current source. */
  private gc(): void {
    for (const path of Object.keys(this.transientData)) {
      const source = getNestedField(this.sourceData, path);

      if (equalsNormalized(source, this.transientData[path])) {
        delete this.transientData[path];
      }
    }
    for (const path of this.transientDeletes) {
      if (getNestedField(this.sourceData, path) === undefined) {
        this.transientDeletes.delete(path);
      }
    }
  }
}

// ---- helpers ----

/**
 * Merge a partial label over its source counterpart, preserving server-managed
 * fields the partial omits. Returns the partial unchanged when there is no
 * source object to merge with (e.g. a newly-created label).
 */
const mergeLabel = (
  source: LabelData | undefined,
  element: LabelData
): LabelData => {
  if (source && typeof source === "object" && !Array.isArray(source)) {
    return { ...source, ...element };
  }
  return element;
};

const getNestedField = <T>(
  data: Record<string, unknown> | undefined,
  path: string
): T | undefined => {
  if (!data) {
    return undefined;
  }

  let current: unknown = data;
  for (const part of path.split(".")) {
    if (
      current !== null &&
      typeof current === "object" &&
      part in (current as object)
    ) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current as T;
};

/**
 * Read the value at a sequence of JSON-pointer segments (object keys / array
 * indices) within a value, or `undefined` if any segment is absent.
 */
const getAtPath = (root: unknown, segments: string[]): unknown => {
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

/**
 * Return a copy of `root` with the leaf at the given JSON-pointer segments
 * removed, copying each node along the path (copy-on-write) so values shared
 * with other structures (e.g. `sourceData`) are not mutated. Returns `root`
 * unchanged if the path is absent.
 */
const withoutPath = (root: unknown, segments: string[]): unknown => {
  if (segments.length === 0 || root === null || typeof root !== "object") {
    return root;
  }

  const [head, ...tail] = segments;
  const clone: Record<string, unknown> | unknown[] = Array.isArray(root)
    ? [...root]
    : { ...root };

  if (!(head in clone)) {
    return clone;
  }

  if (tail.length === 0) {
    delete (clone as Record<string, unknown>)[head];
  } else {
    (clone as Record<string, unknown>)[head] = withoutPath(
      (clone as Record<string, unknown>)[head],
      tail
    );
  }

  return clone;
};

/**
 * Combine a dot-delimited field path with a JSON-patch-style operation path
 * into a single absolute JSON pointer.
 */
const buildJsonPath = (fieldPath: string, operationPath: string): string => {
  const parts = fieldPath.split(".").filter(Boolean);
  parts.push(
    ...operationPath.split("/").filter((s) => s.length > 0 && s !== "/")
  );

  return `/${parts.join("/")}`;
};

const embeddedDocTypeToLabelType = (
  embeddedDocType: string | null | undefined
): LabelType => {
  if (!embeddedDocType) {
    return LabelType.Unknown;
  }

  return EMBEDDED_DOC_TYPE_TO_LABEL_TYPE[embeddedDocType] ?? LabelType.Unknown;
};

/**
 * Recursively normalize a value for comparison. Currently collapses MongoDB
 * `{_cls: "DateTime", datetime: <ms>}` wrappers to ISO strings so a transient
 * ISO-string edit compares equal to a server-side DateTime value representing
 * the same instant. Mirrors `normalizeData` in `core/src/utils/json.ts`.
 */
const normalizeForCompare = (data: unknown): unknown => {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    if (obj._cls === "DateTime" && typeof obj.datetime === "number") {
      const date = new Date(obj.datetime);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, normalizeForCompare(v)])
    );
  }

  if (Array.isArray(data)) {
    return data.map(normalizeForCompare);
  }

  return data;
};

const equalsNormalized = (a: unknown, b: unknown): boolean =>
  isEqual(normalizeForCompare(a), normalizeForCompare(b));

// ---- delta suppliers ----

/**
 * Structural diff for object/array-shaped values. Used for both single labels
 * (the transient already carries the merged target state) and list-label
 * parents (the transient already carries the upserted/filtered list).
 */
const structuralSupplier: JSONDeltaSupplier = (a, b) => {
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
const unknownSupplier: JSONDeltaSupplier = (a, b) => {
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

const defaultDeltaSuppliers = (): Record<LabelType, JSONDeltaSupplier> => ({
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
