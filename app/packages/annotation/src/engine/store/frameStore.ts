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
 * echo/seed payload is the flat {@link FramesData} shape; server-owned-field
 * release in `reconcilePersisted` is not yet implemented.
 */

import type {
  JSONDeltas,
  LabelData,
  LabelType,
  TransientSnapshot,
} from "@fiftyone/utilities";
import {
  equalsNormalized,
  idAlignedListDelta,
  isListLabelType,
  LIST_LABEL_CHILD,
  objectId,
} from "@fiftyone/utilities";

import type { LabelRef } from "../identity/ref";
import type {
  ChangeListener,
  DisplayListener,
  LabelChange,
  LabelStore,
} from "./types";
import { wholeSampleReset } from "./types";

/** One frame's labels, keyed by frame-agnostic field path → element list. */
type FrameDoc = Map<string, LabelData[]>;

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
      (label) => addressIdOf(label) === ref.instanceId
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

  snapshot(): TransientSnapshot {
    const working = new Map<number, FrameDoc>();

    // clone the frame maps; element arrays are copy-on-write (mutations replace
    // them whole), so sharing the array refs is safe
    for (const [frame, doc] of this.working) {
      working.set(frame, new Map(doc));
    }

    return {
      transientData: { working },
      transientDeletes: new Set(),
    } as unknown as TransientSnapshot;
  }

  restore(snapshot: TransientSnapshot): void {
    const { working } = (
      snapshot as unknown as {
        transientData: { working: Map<number, FrameDoc> };
      }
    ).transientData;

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

        const container = `/frames/${frame}/${this.field(path)}`;
        ops.push(...idAlignedListDelta(current, baseline, container, child));
      }
    }

    return ops;
  }

  pendingPaths(): readonly string[] {
    const paths: string[] = [];

    for (const frame of this.working.keys()) {
      for (const path of Object.keys(this.labelTypes)) {
        paths.push(`frames.${frame}.${this.field(path)}`);
      }
    }

    return paths;
  }

  isDirty(): boolean {
    return this.working.size > 0;
  }

  reconcilePersisted(): void {
    // server-owned-field release (e.g. mask_path) is not yet implemented; the
    // routine setData(echo) re-baseline is what clears dirty after a save.
  }

  // ---- lifecycle ----

  setData(data: Record<string, unknown>): void {
    this.source = this.parse(data as FramesData);

    // GC: a working frame now equal to the new source is no longer dirty;
    // one that still differs (edited mid-save) stays as the next delta
    for (const [frame, doc] of [...this.working]) {
      if (this.frameEquals(doc, this.source.get(frame))) {
        this.working.delete(frame);
      }
    }

    this.emit([wholeSampleReset(this.sample)]);
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
    produce: (existing: LabelData | undefined) => LabelData
  ): void {
    if (ref.frame == null) {
      return;
    }

    const doc = this.editableFrame(ref.frame);
    const list = doc.get(ref.path) ?? [];
    const index = list.findIndex(
      (label) => addressIdOf(label) === ref.instanceId
    );
    const next = produce(index >= 0 ? list[index] : undefined);

    doc.set(
      ref.path,
      index >= 0
        ? [...list.slice(0, index), next, ...list.slice(index + 1)]
        : [...list, next]
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

  /** Strip the frame-container prefix for the wire path (`frames.detections` → `detections`). */
  private field(path: string): string {
    return path.startsWith("frames.") ? path.slice("frames.".length) : path;
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
