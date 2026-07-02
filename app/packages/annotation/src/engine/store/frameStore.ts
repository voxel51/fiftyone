/**
 * The frame-indexed {@link LabelStore}: committed truth for a video sample's
 * per-frame labels, addressed by the full ref tuple `(path, instanceId, frame)`.
 * The sample-level sibling is `SampleLabelStore`; stores never know about each
 * other.
 *
 * Identity: `instanceId` is the TRACK's `instance._id`, not the per-frame
 * document `_id`. So `(instanceId, frameN)` and `(instanceId, frameM)` are
 * distinct refs (the same track's box on two frames), and
 * `linkageKey === instanceId` aggregates the whole track — one canvas handle per
 * track, the playhead choosing which frame's geometry it shows. The per-frame
 * document `_id` is minted on create, preserved on edit, and round-tripped as a
 * field; persistence aligns each frame's list by that document `_id` (1:1 with
 * the track within a frame), while addressing uses `instance._id`.
 *
 * State: a `source` (server truth) plus a copy-on-write `working` overlay of
 * edited frames, which doubles as the dirty set. A successful `setData(echo)`
 * re-baselines `source` and GCs working frames now equal to it, so an edit made
 * during a save survives as the next delta; a failed save touches nothing, so
 * the next `getJsonPatch` re-emits idempotently.
 *
 * Handles list-label frame fields (Detections/Keypoints/…). The server
 * echo/seed payload is the flat {@link FramesData} shape.
 */

import type { JSONDeltas, LabelData, LabelType } from "@fiftyone/utilities";
import {
  applyDeltas,
  equalsNormalized,
  idAlignedListDelta,
  isListLabelType,
  LIST_LABEL_CHILD,
  objectId,
} from "@fiftyone/utilities";

import { toSchemaField } from "../identity/framePath";
import type { LabelRef } from "../identity/ref";
import type {
  ChangeListener,
  DisplayListener,
  LabelChange,
  LabelStore,
  StoreSnapshot,
} from "./types";
import { wholeSampleReset } from "./types";

/** One frame's labels, keyed by frame-agnostic field path → element list. */
type FrameDoc = Map<string, LabelData[]>;

/** The store's transient state for transaction rollback: the dirty overlay. */
interface FrameSnapshot {
  working: Map<number, FrameDoc>;
}

/** Flat per-frame seed/echo shape: `{ [frame]: { [path]: elements } }`. */
export type FramesData = Record<number, Record<string, LabelData[]>>;

export interface FrameStoreOptions {
  /** Frame-agnostic label paths → type, e.g. `{ "frames.detections": Detections }`. */
  labelTypes: Record<string, LabelType>;
  /** Initial server frames. */
  data?: FramesData;
}

/** Track identity is `instance._id`; fall back to the doc `_id` (legacy, no instance). */
const addressIdOf = (label: LabelData): string | undefined => {
  const instance = label.instance as { _id?: string } | undefined;
  return instance?._id ?? label._id;
};

export class FrameStore implements LabelStore {
  readonly sample: string;

  private readonly labelTypes: Record<string, LabelType>;
  private source = new Map<number, FrameDoc>();
  /** Copy-on-write overlay of edited frames; presence here === dirty. */
  private working = new Map<number, FrameDoc>();
  private readonly displayListeners = new Set<DisplayListener>();
  private readonly changeListeners = new Set<ChangeListener>();

  constructor(sample: string, options: FrameStoreOptions) {
    this.sample = sample;
    this.labelTypes = options.labelTypes;
    this.source = this.parse(options.data ?? {});
  }

  // ---- resolution ----

  getLabel(ref: LabelRef): LabelData | undefined {
    if (ref.frame == null) {
      return undefined;
    }

    return this.listAt(ref.frame, ref.path).find(
      (label) => addressIdOf(label) === ref.instanceId,
    );
  }

  listLabels(path: string, frame?: number): LabelData[] {
    if (frame != null) {
      return this.listAt(frame, path);
    }

    const out: LabelData[] = [];

    for (const f of this.frames()) {
      out.push(...this.listAt(f, path));
    }

    return out;
  }

  getLabelType(path: string): LabelType {
    return this.labelTypes[path] ?? ("Unknown" as LabelType);
  }

  enumerateLabels(kinds: readonly LabelType[]): LabelRef[] {
    const refs: LabelRef[] = [];

    for (const frame of this.frames()) {
      for (const path of Object.keys(this.labelTypes)) {
        if (!kinds.includes(this.labelTypes[path])) {
          continue;
        }

        for (const label of this.listAt(frame, path)) {
          const instanceId = addressIdOf(label);

          if (instanceId !== undefined) {
            refs.push({ sample: this.sample, path, instanceId, frame });
          }
        }
      }
    }

    return refs;
  }

  dirtyFrames(): number[] {
    return [...this.working.keys()];
  }

  loadedFrames(): number[] {
    return this.frames();
  }

  // ---- mutation ----

  updateLabel(ref: LabelRef, partial: Partial<LabelData>): void {
    this.writeFrame(ref, (existing) => {
      if (existing) {
        // merge; identity fields are the store's, never the partial's
        return {
          ...existing,
          ...partial,
          _id: existing._id,
          instance: existing.instance,
        };
      }

      return this.born(ref, partial);
    });
  }

  replaceLabel(ref: LabelRef, value: Partial<LabelData>): void {
    // exact value (undo/redo replays) but identity survives the round-trip
    this.writeFrame(ref, (existing) => ({
      ...value,
      _id: existing?._id ?? objectId(),
      instance: existing?.instance ?? { _id: ref.instanceId, _cls: "Instance" },
    }));
  }

  deleteLabel(ref: LabelRef): void {
    if (ref.frame == null) {
      return;
    }

    const doc = this.editableFrame(ref.frame);
    const list = doc.get(ref.path);

    if (!list) {
      return;
    }

    const next = list.filter((label) => addressIdOf(label) !== ref.instanceId);

    if (next.length === list.length) {
      return;
    }

    doc.set(ref.path, next);
    this.emit([{ ref, kind: "delete" }]);
  }

  // ---- observability ----

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

  // ---- atomicity (engine transactions) ----

  snapshot(): StoreSnapshot {
    const working = new Map<number, FrameDoc>();

    // clone the frame maps; element arrays are copy-on-write (mutations replace
    // them whole), so sharing the array refs is safe
    for (const [frame, doc] of this.working) {
      working.set(frame, new Map(doc));
    }

    const snapshot: FrameSnapshot = { working };
    return snapshot;
  }

  restore(snapshot: StoreSnapshot): void {
    const { working } = snapshot as FrameSnapshot;

    this.working = new Map();

    for (const [frame, doc] of working) {
      this.working.set(frame, new Map(doc));
    }
  }

  // ---- persistence (one /frames/<n>/<field> delta set per dirty frame) ----

  getJsonPatch(): JSONDeltas {
    const ops: JSONDeltas = [];

    for (const [frame, doc] of this.working) {
      const source = this.source.get(frame);

      for (const path of Object.keys(this.labelTypes)) {
        const type = this.labelTypes[path];
        const child = LIST_LABEL_CHILD[type];

        if (!isListLabelType(type) || !child) {
          continue;
        }

        const current = doc.get(path) ?? [];
        const baseline = source?.get(path) ?? [];

        if (current === baseline) {
          continue;
        }

        const container = `/frames/${frame}/${toSchemaField(path)}`;
        ops.push(...idAlignedListDelta(current, baseline, container, child));
      }
    }

    return ops;
  }

  pendingPaths(): readonly string[] {
    const paths: string[] = [];

    for (const frame of this.working.keys()) {
      for (const path of Object.keys(this.labelTypes)) {
        paths.push(`frames.${frame}.${toSchemaField(path)}`);
      }
    }

    return paths;
  }

  isDirty(): boolean {
    return this.working.size > 0;
  }

  /** No-op: frames protect in-flight edits structurally (see {@link reconcilePersisted}). */
  captureBaseline(): void {}

  /**
   * Fold the server-confirmed deltas into `source` (the new committed truth),
   * then drop working frames now equal to it (the `/frames` source is not
   * refetched after a save, so no echo arrives to drive the GC). A frame edited
   * mid-save still differs from the rebased source, so it stays dirty.
   *
   * Emits TARGETED per-label changes — only labels whose DISPLAYED value
   * actually changed across the rebase — not a blanket whole-sample reset. The
   * common case (folding back the deltas the client already applied) leaves the
   * working-over-source projection identical, so it emits nothing to the change
   * channel and the bridge re-applies no overlays. A blanket reset would
   * reproject every present overlay on every persist tick, clobbering in-flight
   * canvas interaction state (a resize in progress, a polyline's sticky
   * endpoint). The display channel still fires (via `emit`), so dirty-state /
   * version bookkeeping stays fresh — this mirrors the sample store's
   * change-only-what-changed reconcile.
   */
  reconcilePersisted(deltas: JSONDeltas): void {
    const byFrame = new Map<number, JSONDeltas>();

    for (const op of deltas) {
      const segments = op.path.split("/").filter(Boolean);

      // /frames/<n>/<wireField>/<listChild>/...
      if (segments[0] !== "frames" || segments.length < 4) {
        continue;
      }

      const frame = Number(segments[1]);

      if (!Number.isFinite(frame)) {
        continue;
      }

      let frameOps = byFrame.get(frame);

      if (!frameOps) {
        frameOps = [];
        byFrame.set(frame, frameOps);
      }

      frameOps.push(op);
    }

    if (byFrame.size === 0) {
      return;
    }

    // snapshot the displayed projection for the affected frames BEFORE the
    // rebase so the post-rebase diff sees only genuine visual changes
    const before = new Map<number, Map<string, Map<string, LabelData>>>();

    for (const frame of byFrame.keys()) {
      before.set(frame, this.displayedById(frame));
    }

    for (const [frame, frameOps] of byFrame) {
      this.source.set(frame, this.rebaseFrame(frame, frameOps));
    }

    for (const [frame, doc] of [...this.working]) {
      if (this.frameEquals(doc, this.source.get(frame))) {
        this.working.delete(frame);
      }
    }

    this.emit(this.diffDisplayed(before));
  }

  /**
   * Diff a previously-captured displayed projection against the current one and
   * emit one targeted change per label whose value actually moved. `before` was
   * snapshotted (per affected frame) ahead of the source mutation; this reads
   * the post-mutation projection and reports only genuine deltas — the engine of
   * the change-only-what-changed reconcile that keeps in-flight canvas
   * interaction (a resize, a polyline's sticky endpoint) from being clobbered by
   * a blanket reproject.
   */
  private diffDisplayed(
    before: Map<number, Map<string, Map<string, LabelData>>>,
  ): LabelChange[] {
    const changes: LabelChange[] = [];

    for (const [frame, prevByPath] of before) {
      const nextByPath = this.displayedById(frame);
      const paths = new Set([...prevByPath.keys(), ...nextByPath.keys()]);

      for (const path of paths) {
        const prev = prevByPath.get(path) ?? new Map<string, LabelData>();
        const next = nextByPath.get(path) ?? new Map<string, LabelData>();

        for (const [instanceId, label] of prev) {
          const after = next.get(instanceId);

          if (!after) {
            changes.push({
              ref: { sample: this.sample, path, instanceId, frame },
              kind: "delete",
            });
          } else if (!equalsNormalized(label, after)) {
            changes.push({
              ref: { sample: this.sample, path, instanceId, frame },
              kind: "update",
            });
          }
        }

        for (const instanceId of next.keys()) {
          if (!prev.has(instanceId)) {
            changes.push({
              ref: { sample: this.sample, path, instanceId, frame },
              kind: "update",
            });
          }
        }
      }
    }

    return changes;
  }

  /** The displayed labels at a frame, indexed by track-address id, per path. */
  private displayedById(frame: number): Map<string, Map<string, LabelData>> {
    const byPath = new Map<string, Map<string, LabelData>>();

    for (const path of Object.keys(this.labelTypes)) {
      const byId = new Map<string, LabelData>();

      for (const label of this.listAt(frame, path)) {
        const instanceId = addressIdOf(label);

        if (instanceId !== undefined) {
          byId.set(instanceId, label);
        }
      }

      byPath.set(path, byId);
    }

    return byPath;
  }

  // ---- lifecycle ----

  /**
   * Re-seed the source from the `/frames` stream. Fires on the initial seed and
   * on every stream-cache edit echo (e.g. a persisted save flowing back), so it
   * must NOT blanket-reset: that reprojected every present overlay on each tick,
   * fighting in-flight interaction and re-creating overlays the user was editing
   * (a video-only path the image store never had). Emits TARGETED changes only
   * for frames whose SOURCE actually moved and whose displayed projection isn't
   * shadowed by a still-dirty working overlay — so an edit in progress (working
   * wins) emits nothing for its own label. Initial hydration mounts via the
   * bridge's registration reconcile; here newcomers fall out as `update` adds.
   */
  setData(data: Record<string, unknown>): void {
    const prevSource = this.source;
    const next = this.parse(data as FramesData);

    // candidate frames: where the SOURCE genuinely changed. A working frame
    // shadows source, so its displayed value is unaffected by a re-seed — but
    // capture it anyway and let the displayed diff (working-over-source) decide.
    const before = new Map<number, Map<string, Map<string, LabelData>>>();

    for (const frame of new Set([...prevSource.keys(), ...next.keys()])) {
      const prev = prevSource.get(frame);
      const after = next.get(frame);

      if (prev === undefined || after === undefined) {
        before.set(frame, this.displayedById(frame));
        continue;
      }

      if (!this.frameEquals(prev, after)) {
        before.set(frame, this.displayedById(frame));
      }
    }

    this.source = next;

    // GC: a working frame now equal to the new source is no longer dirty;
    // one that still differs (edited mid-save) stays as the next delta
    for (const [frame, doc] of [...this.working]) {
      if (this.frameEquals(doc, this.source.get(frame))) {
        this.working.delete(frame);
      }
    }

    this.emit(this.diffDisplayed(before));
  }

  clear(): void {
    this.source = new Map();
    this.working = new Map();
    this.emit([wholeSampleReset(this.sample)]);
  }

  // ---- internals ----

  /** Read-through resolution: the working overlay wins, else source, else []. */
  private listAt(frame: number, path: string): LabelData[] {
    return (this.working.get(frame) ?? this.source.get(frame))?.get(path) ?? [];
  }

  /** Every frame with labels, from either layer. */
  private frames(): number[] {
    return [...new Set([...this.source.keys(), ...this.working.keys()])];
  }

  /** Copy-on-write the frame into the working overlay (clone source on first touch). */
  private editableFrame(frame: number): FrameDoc {
    let doc = this.working.get(frame);

    if (!doc) {
      doc = new Map();
      const source = this.source.get(frame);

      if (source) {
        for (const [path, list] of source) {
          doc.set(path, [...list]);
        }
      }

      this.working.set(frame, doc);
    }

    return doc;
  }

  /** Upsert an element via `produce(existing)`, replacing the list COW-style. */
  private writeFrame(
    ref: LabelRef,
    produce: (existing: LabelData | undefined) => LabelData,
  ): void {
    if (ref.frame == null) {
      return;
    }

    const doc = this.editableFrame(ref.frame);
    const list = doc.get(ref.path) ?? [];
    const index = list.findIndex(
      (label) => addressIdOf(label) === ref.instanceId,
    );
    const next = produce(index >= 0 ? list[index] : undefined);

    doc.set(
      ref.path,
      index >= 0
        ? [...list.slice(0, index), next, ...list.slice(index + 1)]
        : [...list, next],
    );

    this.emit([{ ref, kind: "update" }]);
  }

  /** A freshly born element: minted doc id, instance stamped from the track ref. */
  private born(ref: LabelRef, partial: Partial<LabelData>): LabelData {
    return {
      ...partial,
      _id: objectId(),
      instance: { _id: ref.instanceId, _cls: "Instance" },
    };
  }

  /**
   * Fold one frame's confirmed deltas into a fresh source `FrameDoc`. Delta
   * pointers address the wire shape (`/frames/<n>/<wireField>/<listChild>/...`,
   * the list wrapped in its label-doc child); the store holds unwrapped element
   * lists keyed by engine path. Reshape into the wire wrapper, strip the
   * `/frames/<n>` prefix, apply via the shared patch primitive, read the lists
   * back. Non-label source keys are carried through untouched.
   */
  private rebaseFrame(frame: number, frameOps: JSONDeltas): FrameDoc {
    const source = this.source.get(frame);
    const doc: Record<string, Record<string, LabelData[]>> = {};

    for (const path of Object.keys(this.labelTypes)) {
      const child = LIST_LABEL_CHILD[this.labelTypes[path]];

      if (child) {
        doc[toSchemaField(path)] = { [child]: [...(source?.get(path) ?? [])] };
      }
    }

    const scoped: JSONDeltas = frameOps.map((op) => ({
      ...op,
      path: `/${op.path.split("/").filter(Boolean).slice(2).join("/")}`,
    }));

    const next = applyDeltas(doc, scoped);

    const rebased: FrameDoc = source ? new Map(source) : new Map();

    for (const path of Object.keys(this.labelTypes)) {
      const child = LIST_LABEL_CHILD[this.labelTypes[path]];

      if (child) {
        rebased.set(path, next[toSchemaField(path)]?.[child] ?? []);
      }
    }

    return rebased;
  }

  private frameEquals(doc: FrameDoc, source: FrameDoc | undefined): boolean {
    for (const path of Object.keys(this.labelTypes)) {
      if (!equalsNormalized(doc.get(path) ?? [], source?.get(path) ?? [])) {
        return false;
      }
    }

    return true;
  }

  private parse(data: FramesData): Map<number, FrameDoc> {
    const frames = new Map<number, FrameDoc>();

    for (const [key, byPath] of Object.entries(data)) {
      const doc: FrameDoc = new Map();

      for (const [path, list] of Object.entries(byPath)) {
        doc.set(path, [...list]);
      }

      frames.set(Number(key), doc);
    }

    return frames;
  }

  private emit(changes: LabelChange[]): void {
    for (const listener of this.changeListeners) {
      listener(changes);
    }

    for (const listener of this.displayListeners) {
      listener();
    }
  }
}
