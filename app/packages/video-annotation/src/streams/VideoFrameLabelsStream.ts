import {
  type FrameLabelSnapshot,
  type LocalDetection,
  type RawDetection,
  type RawDetectionsField,
  type Stage,
  type SyntheticBox,
} from "@fiftyone/utilities";
import {
  getFrames,
  type FrameDoc,
} from "../../../core/src/client/framesClient";
import {
  frameAt,
  PlaybackStreamBase,
  type BufferReadiness,
  type PlaybackStore,
} from "@fiftyone/playback";
import { isInFetchedRange, mergeRange, toSecondRanges } from "./fetchedRanges";

// `RawDetection`, `RawDetectionsField`, and `LocalDetection` now live in
// `@fiftyone/utilities` (below both annotation packages). Re-exported here for
// back-compat with the package barrel.
export type { LocalDetection, RawDetection, RawDetectionsField };

export interface VideoFrameLabelsStreamOptions {
  id: string;
  /** Sample id for the parent video document. */
  sampleId: string;
  /** Current dataset name (POST /frames requires it). */
  dataset: string;
  /** Active view stages — same shape sent on every dataset query. */
  view: Stage[];
  /** Group slice name, when the dataset is grouped. */
  groupSlice?: string | null;
  /** Total frame count of the clip (1-indexed up to this number). */
  frameCount: number;
  /** Frame rate in frames per second. */
  frameRate: number;
  /**
   * todo - multiple fields
   * Field on the per-frame document that carries `Detections`. Strip the
   * `frames.` prefix that lives in the parent video schema — the per-frame
   * samples returned by `/frames` are already frame-relative.
   *
   * @default "detections"
   */
  frameField?: string;
  /**
   * Number of frames to request in a single `/frames` chunk. Larger
   * values mean fewer round trips but larger payloads.
   *
   * @default 60
   */
  chunkSize?: number;
}

const DEFAULT_CHUNK_SIZE = 60;
const DEFAULT_FRAME_FIELD = "detections";

/**
 * Labels stream backed by the `POST /frames` endpoint.
 *
 * Caches per-frame samples by 1-indexed frame number. `bufferState`
 * reports readiness for a given time; `prefetch` issues a chunk fetch
 * starting at the first missing frame in the requested range; `getValue`
 * reads the cached frame and pulls labels out as overlays so the existing
 * diff path in `VideoLighterTile` can consume them unchanged.
 *
 * Label identity prefers FiftyOne's track `index` when present (so
 * tracked instances mutate in place across frames); falls back to `_id`
 * for un-tracked labels (which will churn each frame).
 */
export class VideoFrameLabelsStream extends PlaybackStreamBase<FrameLabelSnapshot> {
  private readonly sampleId: string;
  private readonly dataset: string;
  private readonly view: Stage[];
  private readonly groupSlice: string | null;
  private readonly frameCount: number;
  private readonly frameRate: number;
  private readonly frameField: string;
  private readonly chunkSize: number;

  private readonly cache = new Map<number, FrameDoc>();
  // Server-original snapshots, populated from `/frames` and never
  // mutated. The eventual delta supplier diffs `cache` against this to
  // compute server PATCHes.
  private readonly baseline = new Map<number, FrameDoc>();
  // Frames with local edits that haven't been persisted to the server.
  private readonly dirty = new Set<number>();
  // Cache refs captured at delta-build time. On persistence success, these
  // become the new baseline; on failure they're discarded. Null when no
  // patch is in flight.
  private pendingCommit: Map<number, FrameDoc> | null = null;
  private readonly inflight = new Map<number, Promise<void>>();
  private readonly fetchedRanges: Array<[number, number]> = [];
  // Cached on each `onCommit` so local-edit republishes can write to
  // the same atom store the engine drives. Null until first commit.
  private lastStore: PlaybackStore | null = null;
  // Monotonic counter bumped on every cache mutation (fetch lands,
  // local edit). Consumers that need to re-derive cross-frame state
  // (e.g. timeline track rows) subscribe via `subscribeToEdits`.
  private editVersion = 0;
  private readonly editListeners = new Set<() => void>();

  constructor(opts: VideoFrameLabelsStreamOptions) {
    super(opts.id, {
      blocking: true,
      duration: opts.frameCount / opts.frameRate,
      nativeStepSeconds: 1 / opts.frameRate,
      lookupPolicy: {
        type: "nearestPrevious",
        thresholdSeconds: 1 / opts.frameRate,
      },
    });

    this.sampleId = opts.sampleId;
    this.dataset = opts.dataset;
    this.view = opts.view;
    this.groupSlice = opts.groupSlice ?? null;
    this.frameCount = opts.frameCount;
    this.frameRate = opts.frameRate;
    this.frameField = opts.frameField ?? DEFAULT_FRAME_FIELD;
    this.chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  }

  /**
   * Resolve once the frame containing `time` is cached. Coalesces against
   * any in-flight chunk covering that frame; otherwise kicks one off.
   *
   * Intended for "show overlays before the user plays" — call this after
   * registering the stream, then `seek(time)` once it resolves so the
   * engine commits with the frame in hand.
   */
  async warmup(time = 0): Promise<void> {
    const frame = this.timeToFrame(time);
    if (this.cache.has(frame)) {
      return;
    }

    const inflight = this.inflight.get(frame);
    if (inflight) {
      await inflight;
      return;
    }

    await this.fetchChunk(frame);
  }

  /**
   * Resolve once every frame in [1, frameCount] is cached. Coalesces
   * against any in-flight chunks; otherwise walks the range in chunk-
   * sized strides and dispatches fetches in parallel.
   *
   * Use for one-shot analyses over the full clip (e.g. building
   * per-class timeline tracks). For long clips this is expensive — a
   * future aggregation endpoint would be preferable.
   */
  async warmupAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    let f = 1;

    while (f <= this.frameCount) {
      if (this.cache.has(f)) {
        f++;
        continue;
      }

      const inflight = this.inflight.get(f);
      if (inflight) {
        promises.push(inflight);
        f += this.chunkSize;
        continue;
      }

      promises.push(this.fetchChunk(f));
      f += this.chunkSize;
    }

    await Promise.all(promises);
  }

  /** Total frames in the clip — useful for callers iterating the cache. */
  get totalFrames(): number {
    return this.frameCount;
  }

  /** Frame rate the stream was constructed with, in fps. */
  get fps(): number {
    return this.frameRate;
  }

  /** Per-frame field that carries the labels (e.g. `"detections"`). */
  get labelsField(): string {
    return this.frameField;
  }

  bufferState(time: number): BufferReadiness {
    const frame = this.timeToFrame(time);

    if (this.cache.has(frame)) {
      return "ready";
    }

    if (this.isInflight(frame)) {
      return "loading";
    }

    if (isInFetchedRange(this.fetchedRanges, frame)) {
      return "ready";
    }

    return "missing";
  }

  prefetch(range: [number, number]): void {
    const [startSec, endSec] = range;
    const startFrame = this.timeToFrame(startSec);
    const endFrame = this.timeToFrame(endSec);

    // Find the first missing frame in the range and issue one chunk
    // starting there. The engine calls prefetch again as the playhead
    // advances — we don't need to fan out multiple requests here.
    for (let f = startFrame; f <= endFrame; f++) {
      if (this.cache.has(f) || this.isInflight(f)) {
        continue;
      }

      void this.fetchChunk(f);

      return;
    }
  }

  getValue(time: number): FrameLabelSnapshot | null {
    const frame = this.timeToFrame(time);
    const sample = this.cache.get(frame);
    if (!sample) {
      // Chunk fetched, this frame had no labels — return an empty
      // snapshot so consumers can tell "no labels here" from "not fetched".
      if (isInFetchedRange(this.fetchedRanges, frame)) {
        return { frameNumber: frame, detections: [] };
      }
      return null;
    }

    return {
      frameNumber: frame,
      // todo - adapter pattern for other label types
      detections: extractDetections(sample, this.frameField),
    };
  }

  /**
   * Custom `onCommit`: dedupe by `frameNumber`. The engine ticks 5–8×
   * within a single frame; default `onCommit` would build a fresh
   * detections array and re-publish on every tick, kicking every
   * `useStream` consumer into a re-render and re-running the overlay
   * diff with identical content. We only need to publish when the frame
   * actually changes — or when transitioning to/from `null` (cache
   * miss → hit when a chunk lands).
   */
  override onCommit(time: number, store: PlaybackStore): void {
    this.lastStore = store;
    const next = this.getValue(time);
    const prev = this.readPublished(store);

    if (prev && next && prev.frameNumber === next.frameNumber) {
      return;
    }

    if (prev === null && next === null) {
      return;
    }

    this.publish(store, next);
  }

  /**
   * Insert or replace a detection in the local cache for the given frame
   * and republish so subscribers re-render at the current playhead. No-op
   * if the frame isn't cached.
   */
  updateLabel(frameNumber: number, detection: LocalDetection): void {
    const existing = this.cache.get(frameNumber);
    if (!existing) {
      return;
    }

    const id = detection._id ?? detection.id;
    if (!id) {
      return;
    }

    const next = withDetectionList(existing, this.frameField, (list) => {
      const idx = list.findIndex((d) => (d._id ?? d.id) === id);
      if (idx < 0) {
        return [...list, detection];
      }

      const copy = list.slice();
      copy[idx] = { ...list[idx], ...detection };
      return copy;
    });

    this.cache.set(frameNumber, next);
    this.dirty.add(frameNumber);
    this.republish();
    this.bumpEditVersion();
  }

  /**
   * Remove a detection from the local cache for the given frame and
   * republish. No-op if the frame isn't cached or the id isn't present.
   */
  deleteLabel(frameNumber: number, detectionId: string): void {
    const existing = this.cache.get(frameNumber);
    if (!existing) {
      return;
    }

    const next = withDetectionList(existing, this.frameField, (list) =>
      list.filter((d) => (d._id ?? d.id) !== detectionId)
    );

    this.cache.set(frameNumber, next);
    this.dirty.add(frameNumber);
    this.republish();
    this.bumpEditVersion();
  }

  /** Whether the given frame has unsaved local edits. */
  isDirty(frameNumber: number): boolean {
    return this.dirty.has(frameNumber);
  }

  /**
   * Snapshots for every frame with unsaved local edits. Each entry pairs the
   * server-original baseline with the current cache state — translation to a
   * wire format (JSON Patch, GraphQL mutation, …) is the caller's concern.
   *
   * Returns an empty array when no frames are dirty.
   */
  getDirtyFrameSnapshots(): Array<{
    frameNumber: number;
    baseline: FrameDoc;
    cache: FrameDoc;
  }> {
    const out: Array<{
      frameNumber: number;
      baseline: FrameDoc;
      cache: FrameDoc;
    }> = [];

    for (const frameNumber of this.dirty) {
      const baseline = this.baseline.get(frameNumber);
      const cache = this.cache.get(frameNumber);

      if (!baseline || !cache) {
        continue;
      }

      out.push({ frameNumber, baseline, cache });
    }

    return out;
  }

  /**
   * Stash the cache refs that were just translated into a persistence
   * payload. Paired with {@link commitPending} on success and
   * {@link discardPending} on failure. Overwrites any prior pending state
   * — the persistence layer guarantees only one in-flight save at a time.
   */
  markCommitPending(
    snapshots: ReadonlyArray<{ frameNumber: number; cache: FrameDoc }>
  ): void {
    this.pendingCommit = new Map(
      snapshots.map((s) => [s.frameNumber, s.cache])
    );
  }

  /**
   * Advance baseline for every pending frame to the cache ref that was
   * captured at {@link markCommitPending} time. A frame stays dirty if the
   * cache has moved since (the user kept editing during the save) — that
   * way the next save sends only the *incremental* delta against the
   * just-saved state.
   */
  commitPending(): void {
    if (!this.pendingCommit) {
      return;
    }

    for (const [frameNumber, frameDoc] of this.pendingCommit) {
      this.baseline.set(frameNumber, frameDoc);
      if (this.cache.get(frameNumber) === frameDoc) {
        this.dirty.delete(frameNumber);
      }
    }

    this.pendingCommit = null;
    this.bumpEditVersion();
  }

  /** Drop the pending snapshot without touching baseline or dirty. */
  discardPending(): void {
    this.pendingCommit = null;
  }

  /**
   * Subscribe to cache-mutation events (fetches landing, local edits).
   * Returns an unsubscribe function. Pair with `getEditVersion` and
   * React's `useSyncExternalStore` to re-derive cross-frame state.
   */
  subscribeToEdits(listener: () => void): () => void {
    this.editListeners.add(listener);
    return () => {
      this.editListeners.delete(listener);
    };
  }

  /** Current cache-mutation version. Increases on every mutation. */
  getEditVersion(): number {
    return this.editVersion;
  }

  private bumpEditVersion(): void {
    this.editVersion++;

    for (const listener of this.editListeners) {
      listener();
    }
  }

  private republish(): void {
    if (!this.lastStore) {
      return;
    }

    const time = this.readCurrentTime(this.lastStore);
    this.publish(this.lastStore, this.getValue(time));
  }

  bufferedRanges(): Array<[number, number]> {
    return toSecondRanges(this.fetchedRanges, this.frameRate);
  }

  /** Map a stream time to the 1-indexed frame number. */
  timeToFrame(time: number): number {
    return frameAt(time, this.frameRate, this.frameCount);
  }

  private isInflight(frame: number): boolean {
    return this.inflight.has(frame);
  }

  private async fetchChunk(startFrame: number): Promise<void> {
    const numFrames = Math.min(
      this.chunkSize,
      this.frameCount - startFrame + 1
    );

    if (numFrames <= 0) {
      return;
    }

    const promise = this.doFetch(startFrame, numFrames).finally(() => {
      for (let f = startFrame; f < startFrame + numFrames; f++) {
        if (this.inflight.get(f) === promise) {
          this.inflight.delete(f);
        }
      }
    });

    for (let f = startFrame; f < startFrame + numFrames; f++) {
      this.inflight.set(f, promise);
    }

    return promise;
  }

  private async doFetch(startFrame: number, numFrames: number): Promise<void> {
    try {
      const result = await getFrames({
        frameNumber: startFrame,
        numFrames,
        frameCount: this.frameCount,
        sampleId: this.sampleId,
        dataset: this.dataset,
        view: this.view,
        slice: this.groupSlice ?? undefined,
      });

      for (const frame of result.frames) {
        // Local edits made before the fetch landed are discarded — the
        // server response is the new source of truth. (Once the delta
        // supplier exists, in-flight edits will be tracked separately
        // and reconciled on persistence success.)
        this.cache.set(frame.frame_number, frame);
        this.baseline.set(frame.frame_number, frame);
        this.dirty.delete(frame.frame_number);
      }

      mergeRange(this.fetchedRanges, result.range);

      if (result.frames.length > 0) {
        this.bumpEditVersion();
      }
    } catch (error) {
      // Surface but don't crash — the engine will keep asking; subsequent
      // prefetch calls will retry the missing frames.
      console.error(
        `[VideoFrameLabelsStream] fetch failed for [${startFrame}, +${numFrames})`,
        error
      );
    }
  }
}

/**
 * Pull detections off a per-frame sample and convert them into the
 * `SyntheticBox` shape the existing overlay-diff path consumes.
 *
 * Prefers FiftyOne's track `index` for stable cross-frame identity; falls
 * back to `_id` so un-tracked detections still render (with the caveat
 * that they will churn add/remove on every frame).
 */
function extractDetections(
  sample: FrameDoc,
  frameField: string
): SyntheticBox[] {
  const raw = sample[frameField] as RawDetectionsField | undefined;
  const detections = raw?.detections;
  if (!Array.isArray(detections)) {
    return [];
  }

  const out: SyntheticBox[] = [];
  for (const det of detections) {
    if (!det.bounding_box || det.bounding_box.length !== 4) {
      continue;
    }

    const id = resolveSyntheticId(det);
    if (!id) {
      continue;
    }

    out.push({
      id,
      _id: det._id ?? det.id ?? undefined,
      label: det.label ?? "",
      bounding_box: det.bounding_box,
      index: det.index,
      instance: det.instance ?? undefined,
      keyframe: det.keyframe ?? false,
      propagation: det.propagation ?? null,
    });
  }

  return out;
}

/**
 * Derive a detection's cross-frame overlay id. Prefers `instance._id` so
 * tracked instances keep one identity across frames; falls back to
 * `track-${index}` for legacy data carrying only a numeric index, then to
 * the per-frame `_id` for untracked, un-instanced detections. `null` when
 * the detection carries no usable identifier.
 */
export function resolveSyntheticId(det: RawDetection): string | null {
  if (det.instance?._id) {
    return `instance-${det.instance._id}`;
  }

  if (det.index !== undefined) {
    return `track-${det.index}`;
  }

  return det._id ?? det.id ?? null;
}

/**
 * Return a shallow copy of `frame` with the `detections` list under
 * `frameField` replaced by `fn(list)`. Preserves the original `frame`
 * object so the baseline map keeps pointing at it.
 */
function withDetectionList(
  frame: FrameDoc,
  frameField: string,
  fn: (list: RawDetection[]) => RawDetection[]
): FrameDoc {
  const existing = frame[frameField] as RawDetectionsField | undefined;
  const list = existing?.detections ?? [];
  return {
    ...frame,
    [frameField]: { ...existing, detections: fn(list) },
  } as FrameDoc;
}
