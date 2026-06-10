import { Field, getFieldInfo, Schema } from "../schema";
import { JSONDeltas, JSONDeltaSupplier } from "../types";
import {
  buildJsonPatch,
  defaultDeltaSuppliers,
  EditedLabel,
  firstEditedLabel,
  SampleSnapshot,
} from "./diff";
import {
  embeddedDocTypeToLabelType,
  isListLabelType,
  LabelData,
  LabelType,
  LIST_LABEL_CHILD,
} from "./labels";
import { equalsNormalized } from "./normalize";
import { getNestedField } from "./pointer";
import { reconcilePersisted } from "./reconcile";

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
 *
 * The diff (JSON-Patch emission) and reconcile (server-owned-field release)
 * logic lives in pure functions in `./diff` and `./reconcile`; this class owns
 * state and hands them a read-only {@link SampleSnapshot}.
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

  // ---- persistence (delegated to pure ./diff and ./reconcile) ----

  /**
   * Build a JSON Patch (RFC 6902) describing all pending transient edits. See
   * {@link buildJsonPatch}.
   */
  getJsonPatch(opts: { isGenerated?: boolean } = {}): JSONDeltas {
    return buildJsonPatch(this.snapshot(), opts);
  }

  /**
   * Return the first edited label across all pending transient entries (used to
   * route generated-view persistence). See {@link firstEditedLabel}.
   */
  firstEditedLabel(
    opts: { isGenerated?: boolean } = {}
  ): EditedLabel | undefined {
    return firstEditedLabel(this.snapshot(), opts);
  }

  /**
   * Release server-owned fields from the transient after a successful persist.
   * See {@link reconcilePersisted}.
   */
  reconcilePersisted(deltas: JSONDeltas): void {
    const result = reconcilePersisted(
      this.snapshot(),
      deltas,
      this.serverOwnedFields
    );

    if (!result) {
      return;
    }

    this.transientData = result.transientData;
    this.notify();
  }

  /**
   * A read-only view of this sample's state for the pure diff/reconcile
   * functions. `getLabelType`/`getSupplier` are bound so they can resolve
   * against this instance's schema and supplier overrides.
   */
  private snapshot(): SampleSnapshot {
    return {
      sourceData: this.sourceData,
      transientData: this.transientData,
      transientDeletes: this.transientDeletes,
      getLabelType: (path) => this.getLabelType(path),
      getSupplier: (type) =>
        this.deltaSuppliers[type] ?? this.deltaSuppliers[LabelType.Unknown],
    };
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
