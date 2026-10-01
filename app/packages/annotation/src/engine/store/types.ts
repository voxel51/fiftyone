/**
 * The committed-store contract the engine federates; {@link SampleLabelStore}
 * and the frame-indexed `FrameStore` implement it. Stores never know about
 * each other.
 */

import type { JSONDeltas, LabelData, LabelType } from "@fiftyone/utilities";

/**
 * Options threaded from the persist caller down to each store's
 * reconcile. `sampleRooted` declares that the deltas use sample-rooted
 * pointers (false for generated/patches views, whose deltas are rooted at
 * the persisted LABEL) — stores must not rebase their source from
 * label-rooted paths.
 */
export interface ReconcileOpts {
  sampleRooted?: boolean;
}

import type { LabelRef } from "../identity/ref";

export type LabelChangeKind = "update" | "delete" | "reset";

/**
 * A store's transient state, captured opaquely for transaction rollback. The
 * engine only round-trips it to the same store's {@link LabelStore.restore}.
 */
export type StoreSnapshot = unknown;

/**
 * A single semantic mutation: an edit, delete, or reconcile happened to
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

/** True if the change is a whole-sample reset (reconcile-and-rehydrate). */
export const isWholeSampleReset = (change: LabelChange): boolean =>
  change.kind === "reset" && change.ref.path === "";

/**
 * A custom persistence transport for one store's JSON-patch deltas. Resolves
 * `true` on success and `false` on failure; version conflicts throw.
 */
export type PersistenceAdapter = (deltas: JSONDeltas) => Promise<boolean>;

/** A track's frames and keyframes, ascending. */
export interface TrackFrames {
  frames: number[];
  keyframes: number[];
}

/** Where a frame store's frames come from beyond what it holds. */
export interface FrameSource {
  /** A track's frames and keyframes per the server index; `null` without one
   *  for `path`. */
  indexedTrack(path: string, instanceId: string): TrackFrames | null;

  /** Load `frames` and keep them until the returned release runs. */
  hold(frames: readonly number[]): Promise<() => void>;
}

/**
 * The committed source of truth for one (sample, shape-region); transient wins
 * over source on read. `snapshot`/`restore` cover transient state and dirty
 * flags only.
 */
export interface LabelStore {
  readonly sample: string;

  /**
   * True while the seed is in flight; implementations notify display
   * subscribers on flips.
   */
  isLoading?(): boolean;

  // resolution
  getLabel(ref: LabelRef): LabelData | undefined;
  listLabels(path: string, frame?: number): LabelData[];
  getLabelType(path: string): LabelType;

  /** A registered per-frame non-label field's value at `frame`; `undefined`
   *  when the store is not frame-indexed, the path is not registered, the
   *  frame is not loaded, or the field is unset. */
  getFrameValue?(path: string, frame: number): unknown;

  /** Edit a registered per-frame non-label field at `frame`. */
  setFrameValue?(path: string, frame: number, value: unknown): void;

  /** Drop a registered per-frame non-label field at `frame`. */
  deleteFrameValue?(path: string, frame: number): void;

  /** Current refs across this store's label paths, filtered to `kinds` — the
   *  per-store half of `engine.enumerateLabels` (hydration). */
  enumerateLabels(kinds: readonly LabelType[]): LabelRef[];

  /** {@link enumerateLabels} at one frame: the frame's refs plus every
   *  frame-less (sample-level) ref. Optional; the engine filters the full
   *  enumeration for a store without it. */
  enumerateLabelsAt?(kinds: readonly LabelType[], frame: number): LabelRef[];

  /** Frame numbers edited this session (the dirty overlay). Empty for stores
   *  that are not frame-indexed. The timeline merges these over the server
   *  index so in-session edits show without a whole-clip walk. */
  dirtyFrames(): number[];

  /** Frame numbers the store has materialized (server seed ∪ edits). Empty for
   *  stores that are not frame-indexed. The timeline overlays these over the
   *  server index: the engine is authoritative for every loaded frame, so this
   *  keeps the timeline correct after a save folds edits into the seed and
   *  clears the dirty set — and naturally composes index (unloaded) ⊕ engine
   *  (loaded window) once the seed is windowed. */
  loadedFrames(): number[];

  /** Frames written this session (edited, restored, or persisted), kept
   *  after a save clears the dirty set: the frames where the store can
   *  differ from the server index the timeline baselines from. Optional;
   *  a store without it is read whole. */
  editedFrames?(): number[];

  /** Bumps whenever an {@link editedFrames} frame's content may have moved.
   *  Optional, paired with {@link editedFrames}. */
  editVersion?(): number;

  /** The frames and keyframes a track occupies across the clip, including
   *  frames the store doesn't hold. Optional; the engine scans
   *  {@link loadedFrames} for a store without it. */
  trackFrames?(path: string, instanceId: string): TrackFrames;

  /** Load `frames` and keep them until the returned release runs. Optional;
   *  a store without it holds every frame it has. */
  holdFrames?(frames: readonly number[]): Promise<() => void>;

  // mutation (upsert by instanceId for list labels) — the store stamps
  // `_id = ref.instanceId`; callers never reconstruct arrays. `updateLabel`
  // merges (unset = explicit null write); `replaceLabel` writes the exact
  // value — value-restoring writers ONLY (undo/redo replays)
  updateLabel(ref: LabelRef, partial: Partial<LabelData>): void;
  replaceLabel(ref: LabelRef, value: Partial<LabelData>): void;
  deleteLabel(ref: LabelRef): void;

  // observability
  subscribe(listener: DisplayListener): () => void;
  subscribeChanges(listener: ChangeListener): () => void;

  // atomicity (engine transactions)
  snapshot(): StoreSnapshot;
  restore(snapshot: StoreSnapshot): void;

  // persistence
  getJsonPatch(opts?: { isGenerated?: boolean }): JSONDeltas;
  pendingPaths(): readonly string[];
  isDirty(): boolean;
  // snapshot the pre-persist transient; the trigger calls this before the patch
  // is sent so reconcilePersisted can keep fields edited while it was in flight
  captureBaseline(): void;
  reconcilePersisted(deltas: JSONDeltas, opts?: ReconcileOpts): void;

  // lifecycle
  setData(data: Record<string, unknown>): void;
  clear(): void;
}
