/**
 * The annotation engine (spec §5): a thin coordinator over pluggable parts —
 * a registry of {@link LabelStore}s, a ref→store router, a change merger, a
 * transaction boundary (§5.1), and the undo stack (§5.2). Surfaces project
 * from it and write back into it; they never sync with each other (§1).
 */

import type {
  JSONDeltas,
  LabelData,
  TransientSnapshot,
} from "@fiftyone/utilities";
import { LabelType, objectId } from "@fiftyone/utilities";

import type { LabelRef, ScopedRef } from "../identity/ref";
import { refKey, toLabelRef } from "../identity/ref";
import type {
  ChangeListener,
  DisplayListener,
  LabelChange,
  LabelStore,
} from "../store/types";
import { isWholeSampleReset } from "../store/types";
import type { UndoEntry, UndoOp } from "./undoStack";
import { UndoStack } from "./undoStack";

/** Sample-bound facade — same API minus the `sample` field on refs (§5). */
export interface ScopedEngine {
  getLabel(ref: ScopedRef): LabelData | undefined;
  updateLabel(ref: ScopedRef, partial: Partial<LabelData>): void;
  deleteLabel(ref: ScopedRef): void;
  createLabel(
    path: string,
    label: Partial<LabelData>,
    frame?: number
  ): LabelRef;
  subscribeChanges(listener: ChangeListener): () => void;
}

/**
 * Engine-internal change observer that runs before subscriber dispatch and
 * may update engine-owned ephemeral state (interaction GC, §6.5) — never a
 * label write.
 */
export type BookkeepingHook = (changes: readonly LabelChange[]) => void;

/** Mirror of `Sample`'s dev-only reentrancy guard (§1.1). */
const REENTRANCY_CHECK_ENABLED =
  typeof process === "undefined" || process.env?.NODE_ENV !== "production";

export class AnnotationEngine {
  private stores = new Map<string, LabelStore>();
  private displayListeners = new Set<DisplayListener>();
  private changeListeners = new Set<ChangeListener>();
  private bookkeepingHooks = new Set<BookkeepingHook>();
  private version = 0;
  private dispatching = false;

  private undos = new UndoStack();
  private replaying = false;

  // outermost-transaction state (§5.1): lazy store snapshots, per-ref
  // before-values for undo capture, and the buffered change stream
  private txDepth = 0;
  private txSnapshots = new Map<LabelStore, TransientSnapshot>();
  private txBefores = new Map<
    string,
    { ref: LabelRef; before: LabelData | undefined }
  >();
  private txChanges: LabelChange[] = [];
  private txDisplayPending = false;

  // ---- identity ----

  mintInstanceId(): string {
    return objectId();
  }

  // ---- registration ----

  /**
   * Register a store (mount-scoped). The engine subscribes both channels:
   * display relays to the merged display channel; changes buffer inside a
   * transaction and dispatch ordered at commit.
   */
  registerStore(store: LabelStore): () => void {
    if (this.stores.has(store.sample)) {
      throw new Error(`a store for sample '${store.sample}' is registered`);
    }

    this.stores.set(store.sample, store);
    const unsubscribeDisplay = store.subscribe(this.onStoreDisplay);
    const unsubscribeChanges = store.subscribeChanges(this.onStoreChanges);

    return () => {
      this.stores.delete(store.sample);
      unsubscribeDisplay();
      unsubscribeChanges();
    };
  }

  // ---- routed reads ----

  getLabel(ref: LabelRef): LabelData | undefined {
    return this.stores.get(ref.sample)?.getLabel(ref);
  }

  getLabelType(path: string): LabelType {
    for (const store of this.stores.values()) {
      const type = store.getLabelType(path);

      if (type !== LabelType.Unknown) {
        return type;
      }
    }

    return LabelType.Unknown;
  }

  listLabels(ref: {
    sample: string;
    path: string;
    frame?: number;
  }): LabelData[] {
    return this.stores.get(ref.sample)?.listLabels(ref.path, ref.frame) ?? [];
  }

  /** Current labels across all stores, for hydration (§6.1). */
  enumerateLabels(kinds: readonly LabelType[]): LabelRef[] {
    const refs: LabelRef[] = [];

    for (const store of this.stores.values()) {
      refs.push(...store.enumerateLabels(kinds));
    }

    return refs;
  }

  // ---- routed writes (bare calls are implicit one-op transactions) ----

  updateLabel(ref: LabelRef, partial: Partial<LabelData>): void {
    this.transaction(() => {
      const store = this.requireStore(ref.sample);
      this.touch(store, ref);
      store.updateLabel(ref, partial);
    });
  }

  deleteLabel(ref: LabelRef): void {
    this.transaction(() => {
      const store = this.requireStore(ref.sample);
      this.touch(store, ref);
      store.deleteLabel(ref);
    });
  }

  /**
   * Mint and write a fresh label, returning its ref. Single-sample sessions
   * may omit the sample via the bare engine call; with multiple stores
   * registered, use `scope(sample).createLabel` (the sample is ambiguous).
   */
  createLabel(
    path: string,
    label: Partial<LabelData>,
    frame?: number
  ): LabelRef {
    return this.createLabelIn(this.soleSample(), path, label, frame);
  }

  // ---- transactions (§5.1) ----

  /**
   * The only write boundary: atomic (lazy snapshot / rollback), one coalesced
   * change dispatch, one undo unit. Nested calls join the outermost.
   */
  transaction<T>(fn: () => T, opts: { undoKey?: string } = {}): T {
    this.assertNotDispatching("transaction");

    if (this.txDepth > 0) {
      this.txDepth++;

      try {
        return fn();
      } finally {
        this.txDepth--;
      }
    }

    this.txDepth = 1;
    let result: T;

    try {
      result = fn();
    } catch (error) {
      // §5.1: restore touched stores, discard the buffered stream (including
      // the restores' own emissions) — subscribers never observe the abort
      for (const [store, snapshot] of this.txSnapshots) {
        store.restore(snapshot);
      }

      this.resetTransaction();
      throw error;
    }

    const ops = this.captureOps();
    const changes = this.txChanges;
    const displayPending = this.txDisplayPending;
    this.resetTransaction();

    if (ops.length > 0 && !this.replaying) {
      this.undos.push({ ops, undoKey: opts.undoKey });
    }

    if (displayPending) {
      this.notifyDisplay();
    }

    this.dispatchChanges(changes);
    return result;
  }

  // ---- undo (§5.2 / D7) ----

  undo(): void {
    this.assertNotDispatching("undo");
    const entry = this.undos.takeUndo();

    if (entry) {
      this.replay(entry, "undo");
    }
  }

  redo(): void {
    this.assertNotDispatching("redo");
    const entry = this.undos.takeRedo();

    if (entry) {
      this.replay(entry, "redo");
    }
  }

  canUndo(): boolean {
    return this.undos.canUndo();
  }

  canRedo(): boolean {
    return this.undos.canRedo();
  }

  /** The most recently committed unit, for §9 await-and-rollback consumers. */
  lastUndoEntry(): UndoEntry | undefined {
    return this.undos.peekUndo();
  }

  /** §9 rollback reuse: apply an entry's inverses and drop it from history. */
  rollbackEntry(entry: UndoEntry): void {
    this.assertNotDispatching("rollbackEntry");
    this.replay(entry, "undo");
    this.undos.drop(entry);
  }

  // ---- observability (merged across stores) ----

  subscribe(listener: DisplayListener): () => void {
    this.displayListeners.add(listener);
    return () => {
      this.displayListeners.delete(listener);
    };
  }

  subscribeChanges(listener: ChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  getVersion(): number {
    return this.version;
  }

  /** Engine-internal: pre-dispatch bookkeeping (interaction GC, §6.5). */
  registerBookkeeping(hook: BookkeepingHook): () => void {
    this.bookkeepingHooks.add(hook);
    return () => {
      this.bookkeepingHooks.delete(hook);
    };
  }

  // ---- scoping ----

  scope(sample: string): ScopedEngine {
    return {
      getLabel: (ref) => this.getLabel(toLabelRef(sample, ref)),
      updateLabel: (ref, partial) =>
        this.updateLabel(toLabelRef(sample, ref), partial),
      deleteLabel: (ref) => this.deleteLabel(toLabelRef(sample, ref)),
      createLabel: (path, label, frame) =>
        this.createLabelIn(sample, path, label, frame),
      subscribeChanges: (listener) =>
        this.subscribeChanges((changes) => {
          const scoped = changes.filter((c) => c.ref.sample === sample);

          if (scoped.length > 0) {
            listener(scoped);
          }
        }),
    };
  }

  // ---- persistence (one entry per dirty sample) ----

  getJsonPatch(): { sample: string; deltas: JSONDeltas }[] {
    return [...this.stores.values()]
      .filter((store) => store.isDirty())
      .map((store) => ({ sample: store.sample, deltas: store.getJsonPatch() }));
  }

  isDirty(): boolean {
    return [...this.stores.values()].some((store) => store.isDirty());
  }

  reconcilePersisted(results: { sample: string; deltas: JSONDeltas }[]): void {
    for (const { sample, deltas } of results) {
      this.stores.get(sample)?.reconcilePersisted(deltas);
    }
  }

  // ---- internals ----

  private createLabelIn(
    sample: string,
    path: string,
    label: Partial<LabelData>,
    frame?: number
  ): LabelRef {
    return this.transaction(() => {
      const ref: LabelRef = {
        sample,
        path,
        instanceId: this.mintInstanceId(),
        frame,
      };
      const store = this.requireStore(sample);
      this.touch(store, ref);
      store.updateLabel(ref, label);
      return ref;
    });
  }

  private requireStore(sample: string): LabelStore {
    const store = this.stores.get(sample);

    if (!store) {
      throw new Error(`no store registered for sample '${sample}'`);
    }

    return store;
  }

  private soleSample(): string {
    if (this.stores.size !== 1) {
      throw new Error(
        `createLabel without a sample requires exactly one registered store ` +
          `(have ${this.stores.size}); use scope(sample).createLabel`
      );
    }

    return this.stores.keys().next().value as string;
  }

  /** First-touch capture (§5.1 lazy snapshot + §5.2 lazy before-values). */
  private touch(store: LabelStore, ref: LabelRef): void {
    if (!this.txSnapshots.has(store)) {
      this.txSnapshots.set(store, store.snapshot());
    }

    if (this.replaying) {
      return;
    }

    const key = refKey(ref);

    if (!this.txBefores.has(key)) {
      this.txBefores.set(key, { ref, before: store.getLabel(ref) });
    }
  }

  /**
   * Value inverses for the committed transaction. Mutations are
   * copy-on-write, so reference equality detects net no-ops (touched but
   * unchanged, or created-then-deleted).
   */
  private captureOps(): UndoOp[] {
    const ops: UndoOp[] = [];

    for (const { ref, before } of this.txBefores.values()) {
      const after = this.stores.get(ref.sample)?.getLabel(ref);

      if (before === after) {
        continue;
      }

      ops.push({ ref, before, after });
    }

    return ops;
  }

  /** Replay an undo unit: a non-recording transaction writing known values. */
  private replay(entry: UndoEntry, direction: "undo" | "redo"): void {
    this.replaying = true;

    try {
      this.transaction(() => {
        const ops = direction === "undo" ? [...entry.ops].reverse() : entry.ops;

        for (const op of ops) {
          const store = this.stores.get(op.ref.sample);

          if (!store) {
            continue;
          }

          const value = direction === "undo" ? op.before : op.after;

          if (value === undefined) {
            store.deleteLabel(op.ref);
          } else {
            store.updateLabel(op.ref, value, { replace: true });
          }
        }
      });
    } finally {
      this.replaying = false;
    }
  }

  private resetTransaction(): void {
    this.txDepth = 0;
    this.txSnapshots = new Map();
    this.txBefores = new Map();
    this.txChanges = [];
    this.txDisplayPending = false;
  }

  private onStoreDisplay = (): void => {
    if (this.txDepth > 0) {
      this.txDisplayPending = true;
      return;
    }

    this.notifyDisplay();
  };

  private onStoreChanges = (changes: readonly LabelChange[]): void => {
    if (this.txDepth > 0) {
      this.txChanges.push(...changes);
      return;
    }

    this.dispatchChanges(changes);
  };

  private notifyDisplay(): void {
    this.version++;
    this.dispatching = true;

    try {
      for (const listener of this.displayListeners) {
        listener();
      }
    } finally {
      this.dispatching = false;
    }
  }

  private dispatchChanges(changes: readonly LabelChange[]): void {
    if (changes.length === 0) {
      return;
    }

    // history refers to entities a whole-sample reset replaced (§5.2)
    if (changes.some(isWholeSampleReset)) {
      this.undos.clear();
    }

    this.dispatching = true;

    try {
      for (const hook of this.bookkeepingHooks) {
        hook(changes);
      }

      for (const listener of this.changeListeners) {
        listener(changes);
      }
    } finally {
      this.dispatching = false;
    }
  }

  /** §1.1 keystone: change-subscribers are sinks; writes during dispatch throw. */
  private assertNotDispatching(op: string): void {
    if (REENTRANCY_CHECK_ENABLED && this.dispatching) {
      throw new Error(
        `AnnotationEngine.${op}() was called from within a subscriber. ` +
          `Subscribers are sinks and must never write back to the engine.`
      );
    }
  }
}
