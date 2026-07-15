/**
 * The composite {@link LabelStore} for a video sample: one store the engine
 * federates, routing by path ownership across two backings —
 *
 * - a frame-indexed {@link FrameStore} for the per-frame list fields
 *   (`frames.detections`, …), addressed by `(path, instanceId, frame)`;
 * - the sample-level {@link SampleLabelStore} for everything else
 *   (temporal-detections and any other sample field), addressed by `(path,
 *   instanceId)` with no frame.
 *
 * Engine federation is one store per sample, so a video sample can't register a
 * `FrameStore` and a `SampleLabelStore` separately — this fuses them behind the
 * single registration. The fusion is pure routing: each child keeps its own
 * identity, transactions, persistence, and change stream, and they never know
 * about each other. Frame paths are exactly the `FrameStore`'s configured label
 * paths (`getLabelType !== Unknown`); every other path falls to the sample
 * store.
 *
 * `getJsonPatch` unions both children (frame ops are `/frames/<n>/<field>`,
 * sample ops are top-level), so a mixed dirty set persists in one entry.
 * `setData` seeds only the sample backing — the frame backing is fed its flat
 * {@link FramesData} directly by the surface that owns the `/frames` source.
 */

import type { JSONDeltas, LabelData } from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";

import type { LabelRef } from "../identity/ref";
import type { FrameStore } from "./frameStore";
import type { SampleLabelStore } from "./sampleLabelStore";
import type {
  ChangeListener,
  DisplayListener,
  LabelStore,
  StoreSnapshot,
} from "./types";

/** Bundles the children's opaque transient snapshots into one. */
interface CompositeSnapshot {
  frames: StoreSnapshot;
  sampleLevel: StoreSnapshot;
}

export class VideoLabelStore implements LabelStore {
  readonly sample: string;

  // held as the federated contract — the composite is pure routing and never
  // reaches for a child's concrete API
  private readonly frames: LabelStore;
  private readonly sampleLevel: LabelStore;

  constructor(
    sample: string,
    frames: FrameStore,
    sampleLevel: SampleLabelStore,
  ) {
    this.sample = sample;
    this.frames = frames;
    this.sampleLevel = sampleLevel;
  }

  // ---- resolution ----

  getLabel(ref: LabelRef): LabelData | undefined {
    return this.route(ref.path).getLabel(ref);
  }

  listLabels(path: string, frame?: number): LabelData[] {
    return this.route(path).listLabels(path, frame);
  }

  getLabelType(path: string): LabelType {
    return this.route(path).getLabelType(path);
  }

  enumerateLabels(kinds: readonly LabelType[]): LabelRef[] {
    return [
      ...this.frames.enumerateLabels(kinds),
      ...this.sampleLevel.enumerateLabels(kinds),
    ];
  }

  dirtyFrames(): number[] {
    return this.frames.dirtyFrames();
  }

  loadedFrames(): number[] {
    return this.frames.loadedFrames();
  }

  // ---- mutation ----

  updateLabel(ref: LabelRef, partial: Partial<LabelData>): void {
    this.route(ref.path).updateLabel(ref, partial);
  }

  replaceLabel(ref: LabelRef, value: Partial<LabelData>): void {
    this.route(ref.path).replaceLabel(ref, value);
  }

  deleteLabel(ref: LabelRef): void {
    this.route(ref.path).deleteLabel(ref);
  }

  // ---- observability (union both children's streams) ----

  subscribe(listener: DisplayListener): () => void {
    const unsubFrames = this.frames.subscribe(listener);
    const unsubSample = this.sampleLevel.subscribe(listener);

    return () => {
      unsubFrames();
      unsubSample();
    };
  }

  subscribeChanges(listener: ChangeListener): () => void {
    const unsubFrames = this.frames.subscribeChanges(listener);
    const unsubSample = this.sampleLevel.subscribeChanges(listener);

    return () => {
      unsubFrames();
      unsubSample();
    };
  }

  // ---- atomicity (bundle both children's transient state) ----

  snapshot(): StoreSnapshot {
    const snapshot: CompositeSnapshot = {
      frames: this.frames.snapshot(),
      sampleLevel: this.sampleLevel.snapshot(),
    };
    return snapshot;
  }

  restore(snapshot: StoreSnapshot): void {
    const bundle = snapshot as CompositeSnapshot;
    this.frames.restore(bundle.frames);
    this.sampleLevel.restore(bundle.sampleLevel);
  }

  // ---- persistence (union; frame ops are /frames/<n>/<field>) ----

  getJsonPatch(opts?: { isGenerated?: boolean }): JSONDeltas {
    return [
      ...this.frames.getJsonPatch(),
      ...this.sampleLevel.getJsonPatch(opts),
    ];
  }

  pendingPaths(): readonly string[] {
    return [...this.frames.pendingPaths(), ...this.sampleLevel.pendingPaths()];
  }

  isDirty(): boolean {
    return this.frames.isDirty() || this.sampleLevel.isDirty();
  }

  captureBaseline(): void {
    this.frames.captureBaseline();
    this.sampleLevel.captureBaseline();
  }

  reconcilePersisted(deltas: JSONDeltas): void {
    const frameDeltas: JSONDeltas = [];
    const sampleDeltas: JSONDeltas = [];

    for (const op of deltas) {
      (op.path.startsWith("/frames/") ? frameDeltas : sampleDeltas).push(op);
    }

    this.frames.reconcilePersisted(frameDeltas);
    this.sampleLevel.reconcilePersisted(sampleDeltas);
  }

  // ---- lifecycle ----

  /**
   * Seed the sample backing (a `Sample`-shaped dict). The frame backing is
   * seeded out-of-band by its `/frames` owner — the two payload shapes differ,
   * so the composite never re-routes one into the other.
   */
  setData(data: Record<string, unknown>): void {
    this.sampleLevel.setData(data);
  }

  clear(): void {
    this.frames.clear();
    this.sampleLevel.clear();
  }

  // ---- internals ----

  /** Frame paths are the FrameStore's configured paths; all else is sample-level. */
  private route(path: string): LabelStore {
    return this.frames.getLabelType(path) !== LabelType.Unknown
      ? this.frames
      : this.sampleLevel;
  }
}
