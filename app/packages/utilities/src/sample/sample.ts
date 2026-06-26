import { Field, getFieldInfo, Schema } from "../schema";
import { JSONDeltas } from "../types";
import {
  buildJsonPatch,
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
 * The nature of a {@link SampleChange}: `Update`/`Delete` for in-session edits;
 * `Reset` for a rebuild (whole-sample via the `""` path sentinel, or per-path
 * after `reconcilePersisted` releases a server-owned field).
 */
export enum SampleChangeKind {
  Update = "update",
  Delete = "delete",
  Reset = "reset",
}

/**
 * A single field-level mutation, delivered to {@link Sample.subscribeChanges}
 * subscribers so they can reconcile their own view of the sample without
 * re-diffing the whole thing.
 *
 * - `path` — the dot-delimited field path that changed (e.g. `ground_truth`,
 *   `metadata.size_bytes`). The empty string `""` is the **whole-sample reset
 *   sentinel**: the entire sample was replaced (`setData`) or all edits dropped
 *   (`clear`), so subscribers should rebuild from a fresh snapshot.
 * - `labelId` — for a list label (Detections, etc.), the `_id` of the element
 *   that changed; absent for single labels and primitives.
 * - `kind` — see {@link SampleChangeKind}.
 */
export interface SampleChange {
  path: string;
  labelId?: string;
  kind: SampleChangeKind;
}

/** Subscriber to {@link Sample} mutations; receives the batch of changes. */
export type SampleChangeListener = (changes: readonly SampleChange[]) => void;

/**
 * A captured copy of the transient edit state (pending data + pending
 * deletions), for transaction atomicity: capture via
 * {@link Sample.snapshotTransient}, roll back via
 * {@link Sample.restoreTransient}. Source data is never part of a snapshot —
 * only `setData`/`reconcilePersisted` write it, and those are not
 * transactional mutations.
 */
export type TransientSnapshot = {
  transientData: Record<string, unknown>;
  transientDeletes: ReadonlySet<string>;
};

/**
 * Whether the dev-time reentrancy guard is active. Enabled outside production
 * builds so a change subscriber that illegally writes back to Sample (the
 * Phase 5 acyclic-dataflow violation) fails loudly in dev and test, but never
 * throws in a shipped build.
 */
const REENTRANCY_CHECK_ENABLED =
  typeof process === "undefined" || process.env?.NODE_ENV !== "production";

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
  private serverOwnedFields: Set<string>;
  private listeners: Set<() => void> = new Set();
  private changeListeners: Set<SampleChangeListener> = new Set();
  private version = 0;
  private dispatching = false;

  constructor(opts: SampleOptions = {}) {
    if (opts.data) {
      this.sourceData = opts.data;
    }

    if (opts.schema) {
      this.schema = opts.schema;
    }

    this.serverOwnedFields = new Set(
      opts.serverOwnedFields ?? DEFAULT_SERVER_OWNED_FIELDS,
    );
  }

  // ---- subscriptions ----

  /**
   * Display channel — pair with {@link getVersion} for `useSyncExternalStore`.
   *
   * Level-triggered and lossy: emissions coalesce, so the listener is *not*
   * guaranteed to fire once per change — only that state eventually converges.
   * Re-read current state on each fire (`getResolved`/`getSnapshot`); never do
   * per-change work here (use {@link subscribeChanges}). Returns unsubscribe.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Reconcile channel — for consumers that apply changes incrementally.
   *
   * Edge-triggered: every mutation is delivered once, in order, synchronously.
   * The {@link SampleChange} batch is an invalidation signal (path/labelId/
   * kind), not data — read the value via {@link getResolved}/{@link getLabel}.
   * Returns unsubscribe.
   *
   * Invariant (throws in dev, see {@link assertNotDispatching}): subscribers
   * are sinks and must never write back to Sample — that keeps the dataflow
   * acyclic, so there is no echo guard to converge. Writers are user-gesture
   * finalizers and the server-reconcile path only.
   */
  subscribeChanges = (listener: SampleChangeListener): (() => void) => {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  };

  /**
   * Monotonically-increasing version counter, bumped on every state change.
   * Stable across no-op calls; suitable as a `getSnapshot` for
   * `useSyncExternalStore`.
   */
  getVersion = (): number => this.version;

  private notify(changes: SampleChange[]): void {
    this.version++;

    // Both subscriber kinds are sinks: a write from within either would
    // re-enter notify (recursing and inflating the version), so the reentrancy
    // guard spans both loops. See assertNotDispatching.
    this.dispatching = true;
    try {
      for (const listener of this.listeners) {
        listener();
      }

      // A schema-only change (or any version-only bump) carries no
      // SampleChange: display subscribers re-render, reconcilers have no work.
      if (changes.length > 0) {
        for (const listener of this.changeListeners) {
          listener(changes);
        }
      }
    } finally {
      this.dispatching = false;
    }
  }

  /**
   * Guard the acyclic-dataflow invariant: throw if a mutator is called while a
   * change batch is being dispatched, i.e. from within a change subscriber.
   * Dev/test only (see {@link REENTRANCY_CHECK_ENABLED}).
   */
  private assertNotDispatching(op: string): void {
    if (REENTRANCY_CHECK_ENABLED && this.dispatching) {
      throw new Error(
        `Sample.${op}() was called from within a subscriber. Subscribers ` +
          `(display and change) must be sinks and never write back to Sample ` +
          `route the write through a user-gesture or reconcile path instead.`,
      );
    }
  }

  // ---- source data / schema ----

  setData(data: Record<string, unknown>): void {
    this.assertNotDispatching("setData");
    this.sourceData = data;
    this.gc();
    this.notify([{ path: "", kind: SampleChangeKind.Reset }]);
  }

  getData(): Record<string, unknown> {
    return this.sourceData;
  }

  setSchema(schema: Schema): void {
    this.assertNotDispatching("setSchema");
    this.schema = schema;
    // Schema affects type resolution, not values: bump display, no reconcile.
    this.notify([]);
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
    this.assertNotDispatching("setField");
    this.transientData[path] = data;
    this.transientDeletes.delete(path);
    this.notify([{ path, kind: SampleChangeKind.Update }]);
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
   * when only a partial update is supplied. Unsetting an attribute is an
   * explicit `null` write, never a key removal — the merge would otherwise
   * resurrect the removed value.
   *
   * For list labels, `data._id` is required and the label is upserted into
   * the parent list (merged with the prior element if one with the same `_id`
   * exists, otherwise appended).
   */
  updateLabel(path: string, data: Partial<LabelData>): void {
    this.writeLabel(path, data, false);
  }

  /**
   * Write a label's exact value at the given path — no merge with the
   * existing label, so keys absent from `data` end up absent. For
   * value-restoring writers (undo/redo replays), where a merge would leave
   * fields behind that the restored value no longer has. Same upsert
   * addressing as {@link updateLabel}.
   */
  replaceLabel(path: string, data: Partial<LabelData>): void {
    this.writeLabel(path, data, true);
  }

  private writeLabel(
    path: string,
    data: Partial<LabelData>,
    replace: boolean,
  ): void {
    this.assertNotDispatching(replace ? "replaceLabel" : "updateLabel");
    const type = this.getLabelType(path);
    let labelId: string | undefined;

    if (isListLabelType(type)) {
      if (!data._id) {
        throw new Error(`list label update at '${path}' requires an _id`);
      }
      labelId = data._id;

      const child = LIST_LABEL_CHILD[type]!;
      const existing =
        this.getResolved<Record<string, unknown>>(path) ??
        ({} as Record<string, unknown>);
      const prior = Array.isArray(existing[child])
        ? (existing[child] as LabelData[])
        : [];
      const next = [...prior];
      const idx = next.findIndex((l) => l._id === data._id);
      const value = (
        idx >= 0 && !replace ? { ...next[idx], ...data } : { ...data }
      ) as LabelData;

      if (idx >= 0) {
        next.splice(idx, 1, value);
      } else {
        next.push(value);
      }

      this.transientData[path] = { ...existing, [child]: next };
    } else {
      const existing = replace
        ? ({} as LabelData)
        : (this.getResolved<LabelData>(path) ?? ({} as LabelData));
      this.transientData[path] = { ...existing, ...data };
    }

    this.transientDeletes.delete(path);
    this.notify([{ path, labelId, kind: SampleChangeKind.Update }]);
  }

  /**
   * Mark a non-label field for deletion. The next {@link getJsonPatch} will
   * emit a `remove` op for it if the source has a value at this path.
   */
  deleteField(path: string): void {
    this.assertNotDispatching("deleteField");
    delete this.transientData[path];
    this.transientDeletes.add(path);
    this.notify([{ path, kind: SampleChangeKind.Delete }]);
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
    this.assertNotDispatching("deleteLabel");
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

      this.notify([{ path, labelId: id, kind: SampleChangeKind.Delete }]);

      return;
    }

    this.deleteField(path);
  }

  // ---- transaction primitives ----

  /**
   * Capture the transient edit state. Mutators replace path entries rather
   * than mutating them in place (copy-on-write), so a shallow capture is a
   * faithful snapshot.
   */
  snapshotTransient(): TransientSnapshot {
    return {
      transientData: { ...this.transientData },
      transientDeletes: new Set(this.transientDeletes),
    };
  }

  /**
   * Roll back the transient edit state to a prior snapshot. Emits a per-path
   * reset for every path whose pending state differs, so subscribers re-read
   * just those. The snapshot is copied in, so it may be restored again.
   */
  restoreTransient(snapshot: TransientSnapshot): void {
    this.assertNotDispatching("restoreTransient");
    const changes: SampleChange[] = [];
    const paths = new Set([
      ...Object.keys(this.transientData),
      ...Object.keys(snapshot.transientData),
      ...this.transientDeletes,
      ...snapshot.transientDeletes,
    ]);

    for (const path of paths) {
      const dataChanged =
        this.transientData[path] !== snapshot.transientData[path];
      const deleteChanged =
        this.transientDeletes.has(path) !== snapshot.transientDeletes.has(path);

      if (dataChanged || deleteChanged) {
        changes.push({ path, kind: SampleChangeKind.Reset });
      }
    }

    if (changes.length === 0) {
      return;
    }

    this.transientData = { ...snapshot.transientData };
    this.transientDeletes = new Set(snapshot.transientDeletes);
    this.notify(changes);
  }

  // ---- dirty introspection ----

  /** Paths with pending transient state (edits or deletions). */
  pendingPaths(): readonly string[] {
    return [
      ...new Set([
        ...Object.keys(this.transientData),
        ...this.transientDeletes,
      ]),
    ];
  }

  /** True if any transient edit or deletion is pending. */
  isDirty(): boolean {
    return (
      Object.keys(this.transientData).length > 0 ||
      this.transientDeletes.size > 0
    );
  }

  // ---- batch ops ----

  /** Drop all pending transient state. */
  clear(): void {
    this.assertNotDispatching("clear");
    this.transientData = {};
    this.transientDeletes.clear();
    this.notify([{ path: "", kind: SampleChangeKind.Reset }]);
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
    opts: { isGenerated?: boolean } = {},
  ): EditedLabel | undefined {
    return firstEditedLabel(this.snapshot(), opts);
  }

  /**
   * Release server-owned fields from the transient after a successful persist.
   * See {@link reconcilePersisted}.
   */
  reconcilePersisted(deltas: JSONDeltas): void {
    this.assertNotDispatching("reconcilePersisted");
    const result = reconcilePersisted(
      this.snapshot(),
      deltas,
      this.serverOwnedFields,
    );

    if (!result) {
      return;
    }

    // A released/dropped path has a new (or absent) reference vs. before;
    // emit a per-path reset so reconcilers re-read just those from source.
    const before = this.transientData;
    const after = result.transientData;
    const changes: SampleChange[] = [];
    for (const path of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ])) {
      if (before[path] !== after[path]) {
        changes.push({ path, kind: SampleChangeKind.Reset });
      }
    }

    this.transientData = after;
    this.notify(changes);
  }

  /**
   * A read-only view of this sample's state for the pure diff/reconcile
   * functions. `getLabelType` is bound so it can resolve against this
   * instance's schema.
   */
  private snapshot(): SampleSnapshot {
    return {
      sourceData: this.sourceData,
      transientData: this.transientData,
      transientDeletes: this.transientDeletes,
      getLabelType: (path) => this.getLabelType(path),
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
