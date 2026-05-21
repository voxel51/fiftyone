import * as jsonpatch from "fast-json-patch";
import { isEqual } from "lodash";
import { Field, Schema, getFieldInfo } from "./schema";
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
   */
  getJsonPatch(): JSONDeltas {
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
      if (isEqual(sourceValue, transientValue)) {
        continue;
      }

      const type = this.getLabelType(path);
      const supplier =
        this.deltaSuppliers[type] ?? this.deltaSuppliers[LabelType.Unknown];
      const subDeltas = supplier(sourceValue, transientValue);

      for (const d of subDeltas) {
        deltas.push({ ...d, path: buildJsonPath(path, d.path) });
      }
    }

    return deltas;
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

      if (isEqual(sourceValue, transientValue)) {
        continue;
      }

      const child = LIST_LABEL_CHILD[type];
      if (child) {
        const transientList = (
          transientValue as Record<string, unknown> | undefined
        )?.[child];
        const sourceList = (
          sourceValue as Record<string, unknown> | undefined
        )?.[child];

        if (!Array.isArray(transientList)) {
          continue;
        }

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

          if (!isEqual(label, sourceById.get(label._id))) {
            return {
              labelId: label._id,
              labelPath: isGenerated ? `${path}.${child}` : path,
            };
          }
        }

        continue;
      }

      // Single-label field
      const single = transientValue as LabelData | undefined;
      if (single?._id) {
        return { labelId: single._id, labelPath: path };
      }
    }

    return undefined;
  }

  /** Drop transient entries that have become no-ops vs. the current source. */
  private gc(): void {
    for (const path of Object.keys(this.transientData)) {
      const source = getNestedField(this.sourceData, path);

      if (isEqual(source, this.transientData[path])) {
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

// ---- delta suppliers ----

/**
 * Structural diff for object/array-shaped values. Used for both single labels
 * (the transient already carries the merged target state) and list-label
 * parents (the transient already carries the upserted/filtered list).
 */
const structuralSupplier: JSONDeltaSupplier = (a, b) => {
  const from = (a ?? {}) as Record<string, unknown> | unknown[];
  const to = (b ?? {}) as Record<string, unknown> | unknown[];

  return jsonpatch.compare(from, to);
};

/**
 * Fallback supplier for fields without a known label type. Handles both
 * primitive and object/array values.
 */
const unknownSupplier: JSONDeltaSupplier = (a, b) => {
  if (isEqual(a, b)) return [];

  const aIsObj = a !== null && typeof a === "object";
  const bIsObj = b !== null && typeof b === "object";

  if (aIsObj && bIsObj) {
    return jsonpatch.compare(
      a as Record<string, unknown> | unknown[],
      b as Record<string, unknown> | unknown[]
    );
  }

  if (b === undefined || b === null) {
    return a === undefined ? [] : [{ op: "remove", path: "" }];
  }

  if (a === undefined) {
    return [{ op: "add", path: "", value: b as never }];
  }

  return [{ op: "replace", path: "", value: b as never }];
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
