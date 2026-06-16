import type {
  JSONDeltas,
  LabelData,
  TransientSnapshot,
} from "@fiftyone/utilities";
import { LabelType, objectId } from "@fiftyone/utilities";
import { isEqual } from "lodash";

import type { LabelRef, ScopedRef } from "../identity/ref";
import { refKey, toLabelRef } from "../identity/ref";
import type {
  ChangeListener,
  DisplayListener,
  LabelChange,
  LabelStore,
} from "../store/types";
import { wholeSampleReset } from "../store/types";
import { registerBridgeLoop } from "../bridge/bridgeLoop";
import type { AdapterMap, SurfaceBridge } from "../bridge/types";
import type { EntityId } from "../identity/entityId";
import { InteractionState } from "../interaction/interactionState";
import type { SignalHandler } from "../signals/signalPipe";
import { SignalPipe } from "../signals/signalPipe";
import { PoolTemporalView } from "../temporal/poolTemporalView";
import type { TemporalView } from "../temporal/types";
import { DispatchGuard } from "./dispatchGuard";
import type { UndoEntry, UndoOp } from "./undoStack";
import { UndoStack } from "./undoStack";

/** Sample-bound facade — same API minus the `sample` field on refs. */
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
 * may update engine-owned ephemeral state (interaction GC) — never a
 * label write.
 */
export type BookkeepingHook = (changes: readonly LabelChange[]) => void;

/**
 * The annotation engine: a thin coordinator over pluggable parts —
 * a registry of {@link LabelStore}s, a ref→store router, a change merger, a
 * transaction boundary, and the undo stack. Surfaces project
 * from it and write back into it; they never sync with each other.
 */
export class AnnotationEngine {
  /** Ephemeral selection/hover/anchor state; GC'd by the engine. */
  readonly interaction: InteractionState;

  /** Derived temporal presence over the pool; ≡ pool when non-temporal. */
  readonly temporal: TemporalView;

  private signals: SignalPipe;

  private stores = new Map<string, LabelStore>();
  private displayListeners = new Set<DisplayListener>();
  private changeListeners = new Set<ChangeListener>();
  private bookkeepingHooks = new Set<BookkeepingHook>();
  private version = 0;

  /** The keystone reentrancy guard, shared with interaction state: one dispatch scope. */
  private guard = new DispatchGuard();

  private undos = new UndoStack();
  private replaying = false;

  // outermost-transaction state: lazy store snapshots, per-ref
  // before-values for undo capture, and the buffered change stream
  private txDepth = 0;
  private txSnapshots = new Map<LabelStore, TransientSnapshot>();
  private txBefores = new Map<
    string,
    { ref: LabelRef; before: LabelData | undefined }
  >();
  private txChanges: LabelChange[] = [];
  private txDisplayPending = false;

  // monotonic source of unique gesture keys (see mintGestureKey)
  private gestureEpoch = 0;

  constructor() {
    this.interaction = new InteractionState(this.guard);
    this.signals = new SignalPipe(this.guard);
    this.temporal = new PoolTemporalView(this);
    this.registerBookkeeping((changes) =>
      this.interaction.gc(changes, (ref) => this.getLabel(ref) !== undefined)
    );
  }

  // ---- identity ----

  mintInstanceId(): string {
    return objectId();
  }

  // ---- registration ----

  /**
   * Register a store (mount-scoped). The engine subscribes both channels:
   * display relays to the merged display channel; changes buffer inside a
   * transaction and dispatch ordered at commit.
   *
   * Unregistering emits no label changes, but engine-owned ephemera must not
   * outlive the store: interaction refs to the departed sample are swept (a
   * synthetic whole-sample-reset GC pass — nothing resolves anymore) and its
   * undo history drops.
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
      this.interaction.gc(
        [wholeSampleReset(store.sample)],
        (ref) => this.getLabel(ref) !== undefined
      );
      this.undos.dropSample(store.sample);
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

  /** Current labels across all stores, for hydration. */
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

  // ---- transactions ----

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
      // abort: restore touched stores, discard the buffered stream (including
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

  /**
   * Mint a fresh, unique gesture id. Pass it as a transaction's `undoKey` for
   * every commit a multi-commit gesture makes (directly, or by stamping it on
   * the events a surface re-emits) so they undo/redo as one unit. Scoped to the
   * gesture's own writes — nothing else can pick it up.
   */
  mintGestureId(): string {
    return `gesture:${(this.gestureEpoch += 1)}`;
  }

  // ---- undo ----

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

  /** Terse newest-first view of the undo/redo stacks; backs the history tooltips. */
  historyView(): { undo: string[]; redo: string[] } {
    return this.undos.describe();
  }

  /** The most recently committed unit, for await-and-rollback persistence consumers. */
  lastUndoEntry(): UndoEntry | undefined {
    return this.undos.peekUndo();
  }

  /** Persist-failure rollback: apply an entry's inverses and drop it from history. */
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

  // ---- signal pipe ----

  publishSignal<T>(topic: string, key: EntityId, payload: T): void {
    this.signals.publish(topic, key, payload);
  }

  subscribeSignal<T>(
    topic: string,
    key: EntityId | "*",
    handler: SignalHandler<T>
  ): () => void {
    return this.signals.subscribe(topic, key, handler);
  }

  /** Engine-internal: pre-dispatch bookkeeping (interaction GC). */
  registerBookkeeping(hook: BookkeepingHook): () => void {
    this.bookkeepingHooks.add(hook);
    return () => {
      this.bookkeepingHooks.delete(hook);
    };
  }

  // ---- bridges ----

  /**
   * Register a retained-mode surface (mount-scoped). The engine derives the
   * whole read-half: hydration, change reconciliation, presence merge, and
   * silent interaction application. Returns unregister.
   */
  registerBridge<Handle, Descriptor>(
    bridge: SurfaceBridge<Handle, Descriptor>,
    adapters: AdapterMap<Handle, Descriptor>
  ): () => void {
    return registerBridgeLoop(this, bridge, adapters);
  }

  // ---- scoping ----

  /**
   * The ambient sample for single-sample sessions (the modal case); throws
   * when federation makes it ambiguous — pass an explicit scope instead.
   */
  ambientSample(): string {
    return this.soleSample();
  }

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
        `the ambient sample requires exactly one registered store ` +
          `(have ${this.stores.size}); pass an explicit sample scope`
      );
    }

    return this.stores.keys().next().value as string;
  }

  /** First-touch capture: lazy store snapshot + lazy undo before-values. */
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

      // value-equal, not just reference-equal: a no-op commit (e.g. a select
      // click that re-writes an unchanged, freshly-built bounding_box) must not
      // accrue a phantom undo entry. isEqual short-circuits on reference, so an
      // unchanged copy-on-write subtree (mask bytes) stays cheap.
      if (isEqual(before, after)) {
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
            store.replaceLabel(op.ref, value);
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

    this.guard.run(() => {
      for (const listener of this.displayListeners) {
        listener();
      }
    });
  }

  private dispatchChanges(changes: readonly LabelChange[]): void {
    if (changes.length === 0) {
      return;
    }

    this.guard.run(() => {
      for (const hook of this.bookkeepingHooks) {
        hook(changes);
      }

      for (const listener of this.changeListeners) {
        listener(changes);
      }
    });
  }

  /** The keystone invariant: change-subscribers are sinks; writes during dispatch throw. */
  private assertNotDispatching(op: string): void {
    this.guard.assert(`AnnotationEngine.${op}()`);
  }
}
