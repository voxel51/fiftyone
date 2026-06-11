/**
 * The committed-store contract the engine federates (spec §3/§4 — D3).
 * `Sample` (via {@link SampleLabelStore}) is the sample-level implementation;
 * a frame-indexed `FrameStore` is another. Stores never know about each other.
 */

import type {
  JSONDeltas,
  LabelData,
  LabelType,
  TransientSnapshot,
} from "@fiftyone/utilities";

import type { LabelRef } from "../identity/ref";

export type LabelChangeKind = "update" | "delete" | "reset";

/**
 * A single semantic mutation (§3): an edit, delete, or reconcile happened to
 * the entity — never "the playhead moved". The payload is an invalidation
 * signal, not data: subscribers re-read via `getLabel`.
 */
export interface LabelChange {
  ref: LabelRef;
  kind: LabelChangeKind;
}

/** Level-triggered display invalidation — coalesced, for useSyncExternalStore. */
export type DisplayListener = () => void;

/** Edge-triggered reconcile stream — every mutation once, in order. */
export type ChangeListener = (changes: readonly LabelChange[]) => void;

/**
 * The whole-sample reset sentinel (`setData`/`clear`): tear down and
 * rehydrate from current state. Mirrors `Sample`'s `""`-path convention.
 */
export const wholeSampleReset = (sample: string): LabelChange => ({
  ref: { sample, path: "", instanceId: "" },
  kind: "reset",
});

/** True if the change is a whole-sample reset (§6.1 `clear()` + hydrate). */
export const isWholeSampleReset = (change: LabelChange): boolean =>
  change.kind === "reset" && change.ref.path === "";

/**
 * The committed source of truth for one (sample, shape-region).
 *
 * Resolution order: transient wins, else source, else undefined.
 * `snapshot`/`restore` cover transient state + dirty flags ONLY — source data
 * is untouched by transactions by definition (§5.1).
 */
export interface LabelStore {
  readonly sample: string;

  // resolution
  getLabel(ref: LabelRef): LabelData | undefined;
  listLabels(path: string, frame?: number): LabelData[];
  getLabelType(path: string): LabelType;

  /** Current refs across this store's label paths, filtered to `kinds` — the
   *  per-store half of `engine.enumerateLabels` (hydration, §6.1). */
  enumerateLabels(kinds: readonly LabelType[]): LabelRef[];

  // mutation (upsert by instanceId for list labels) — the store stamps
  // `_id = ref.instanceId`; callers never reconstruct arrays. `replace`
  // writes the exact value instead of merging (value-restoring writers: undo)
  updateLabel(
    ref: LabelRef,
    partial: Partial<LabelData>,
    opts?: { replace?: boolean }
  ): void;
  deleteLabel(ref: LabelRef): void;

  // observability
  subscribe(listener: DisplayListener): () => void;
  subscribeChanges(listener: ChangeListener): () => void;

  // atomicity (engine transactions, §5.1)
  snapshot(): TransientSnapshot;
  restore(snapshot: TransientSnapshot): void;

  // persistence
  getJsonPatch(opts?: { isGenerated?: boolean }): JSONDeltas;
  pendingPaths(): readonly string[];
  isDirty(): boolean;
  reconcilePersisted(deltas: JSONDeltas): void;

  // lifecycle
  setData(data: Record<string, unknown>): void;
  clear(): void;
}
