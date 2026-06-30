import {
  type FrameLabelSnapshot,
  type LocalDetection,
  type RawDetection,
  type RawDetectionsField,
  type Stage,
  type SyntheticBox,
} from "@fiftyone/utilities";
import { type FrameDoc } from "../../../core/src/client/framesClient";
import { getVideoLabelsWindow } from "../../../core/src/client/videoLabelsClient";
import {
  frameAt,
  PlaybackStreamBase,
  type BufferReadiness,
  type PlaybackStore,
} from "@fiftyone/playback";
import { isInFetchedRange, mergeRange, toSecondRanges } from "./fetchedRanges";

// Re-exported from `@fiftyone/utilities` for the package barrel.
export type { LocalDetection, RawDetection, RawDetectionsField };

export interface VideoFrameLabelsStreamOptions {
  id: string;
  /** Sample id for the parent video document. */
  sampleId: string;
  /** Current dataset name (the window read requires it). */
  dataset: string;
  /** Active view stages — same shape sent on every dataset query. */
  view: Stage[];
  /** Total frame count of the clip (1-indexed up to this number). */
  frameCount: number;
  /** Frame rate in frames per second. */
  frameRate: number;
  /**
   * Primary per-frame field carrying `Detections`, frame-relative (the `frames.`
   * prefix stripped). Backs the read-only overlay snapshot ({@link getValue})
   * and the timeline index's dynamic-attribute lookup.
   *
   * @default "detections"
   */
  frameField?: string;
  /**
   * Every active per-frame label field to fetch + seed into the engine,
   * frame-relative (e.g. `["detections", "polylines"]`). The engine holds all
   * of them so the sidebar/canvas/timeline see every field; defaults to just
   * {@link frameField} when omitted.
   */
  frameFields?: string[];
  /**
   * Number of frames to request in a single window chunk. Larger values mean
   * fewer round trips but larger payloads.
   *
   * @default 60
   */
  chunkSize?: number;
}

const DEFAULT_CHUNK_SIZE = 60;
const DEFAULT_FRAME_FIELD = "detections";

/**
 * Labels stream backed by the `POST /video-labels/window` endpoint.
 *
 * Caches field-projected per-frame label payloads by 1-indexed frame number.
 * `bufferState` reports readiness for a given time; `prefetch` issues a window
 * fetch starting at the first missing frame in the requested range; `getValue`
 * reads the cached frame for the read-only snapshot.
 *
 * Read-only: the stream loads window chunks and seeds the annotation engine's
 * frame store (via {@link cachedFrames} + {@link subscribeToEdits}). All label
 * mutation, dirty tracking, and persistence live in the engine; the stream
 * holds no edit state.
 */
export class VideoFrameLabelsStream extends PlaybackStreamBase<FrameLabelSnapshot> {
  private readonly sampleId: string;
  private readonly dataset: string;
  private readonly view: Stage[];
  private readonly frameCount: number;
  private readonly frameRate: number;
  private frameField: string;
  /** All fields fetched per window + seeded into the engine (primary first). */
  private readonly frameFields: string[];
  private readonly chunkSize: number;

  private readonly cache = new Map<number, FrameDoc>();
  private readonly inflight = new Map<number, Promise<void>>();
  private readonly fetchedRanges: Array<[number, number]> = [];
  // Notified whenever a chunk lands. The annotation engine's frame store
  // re-seeds from `cachedFrames()` on this signal (via `subscribeToEdits`);
  // the stream itself holds no edit state — it is a read-only window seed
  // and the engine owns all label mutations.
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
    this.frameCount = opts.frameCount;
    this.frameRate = opts.frameRate;
    this.frameField = opts.frameField ?? DEFAULT_FRAME_FIELD;
    // Always fetch the primary field; union any extra active fields (deduped).
    this.frameFields =
      opts.frameFields && opts.frameFields.length > 0
        ? [...new Set([this.frameField, ...opts.frameFields])]
        : [this.frameField];
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
   * Resolve once every frame in `[startFrame, endFrame]` (inclusive, clamped to
   * the clip) is cached. Coalesces against in-flight chunks; otherwise walks the
   * range in chunk-sized strides and dispatches the missing chunks in parallel.
   *
   * The bounded fetch an op uses when it needs a known span loaded — e.g.
   * re-interpolation reading its segment's keyframe endpoints and step-holding
   * the tail filler — without warming the whole clip.
   */
  async fetchRange(startFrame: number, endFrame: number): Promise<void> {
    const start = Math.max(1, startFrame);
    const end = Math.min(this.frameCount, endFrame);

    const promises = new Set<Promise<void>>();
    let f = start;

    while (f <= end) {
      if (this.cache.has(f)) {
        f++;
        continue;
      }

      // Reuse an in-flight chunk, but only skip the frames it actually covers:
      // chunks can begin at arbitrary frames (prefetch, an overlapping
      // fetchRange), so striding a full chunkSize past an unaligned promise
      // would jump over frames it never loaded and resolve with a gap.
      const inflight = this.inflight.get(f);
      if (inflight) {
        promises.add(inflight);
        do {
          f++;
        } while (f <= end && this.inflight.get(f) === inflight);
        continue;
      }

      promises.add(this.fetchChunk(f));
      f += this.chunkSize;
    }

    await Promise.all(promises);
  }

  /**
   * Resolve once every frame in [1, frameCount] is cached. Expensive over long
   * clips — prefer {@link fetchRange} for a bounded need. Retained for one-shot
   * whole-clip analyses.
   */
  async warmupAll(): Promise<void> {
    return this.fetchRange(1, this.frameCount);
  }

  /** Total frames in the clip — useful for callers iterating the cache. */
  get totalFrames(): number {
    return this.frameCount;
  }

  /**
   * Every cached frame document, for seeding an external store (the annotation
   * engine's frame store). Pairs with {@link subscribeToEdits} so the seed
   * re-runs as chunks land.
   */
  cachedFrames(): FrameDoc[] {
    return [...this.cache.values()];
  }

  /** Frame rate the stream was constructed with, in fps. */
  get fps(): number {
    return this.frameRate;
  }

  /** Per-frame field that carries the labels (e.g. `"detections"`). */
  get labelsField(): string {
    return this.frameField;
  }

  /**
   * Repoint the primary label field the read-only snapshot ({@link getValue})
   * extracts from. Every field in {@link frameFields} is already fetched into
   * the per-frame cache, so this only changes which one the snapshot reads — no
   * refetch. Lets the active field follow a field-move without rebuilding the
   * stream (which would tear down the engine's frame store and its edits).
   */
  setPrimaryField(field: string): void {
    this.frameField = field;
  }

  /**
   * The dataset query this stream reads against — the params the
   * `/video-labels/{index,window}` fetches share with the `/frames` seed.
   */
  labelQuery(): { sampleId: string; dataset: string; view: Stage[] } {
    return { sampleId: this.sampleId, dataset: this.dataset, view: this.view };
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
   * Custom `onCommit`: dedupe by `frameNumber` so we only publish when the
   * frame changes or transitions to/from `null` (cache miss → hit). Avoids
   * re-publishing identical content on every intra-frame tick.
   */
  override onCommit(time: number, store: PlaybackStore): void {
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
   * Subscribe to cache-mutation events (chunks landing). Returns an
   * unsubscribe function. Used to re-seed an external store (the engine's
   * frame store) whenever the `/frames` cache changes.
   */
  subscribeToEdits(listener: () => void): () => void {
    this.editListeners.add(listener);
    return () => {
      this.editListeners.delete(listener);
    };
  }

  private notifyEdits(): void {
    for (const listener of this.editListeners) {
      listener();
    }
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
      this.frameCount - startFrame + 1,
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
    const endFrame = Math.min(startFrame + numFrames - 1, this.frameCount);

    try {
      const result = await getVideoLabelsWindow({
        sampleId: this.sampleId,
        dataset: this.dataset,
        view: this.view,
        fields: this.frameFields,
        startFrame,
        endFrame,
      });

      let landed = 0;
      for (const [frameNumber, fields] of Object.entries(result.frames)) {
        // Field-projected window payload → the cache's per-frame doc shape.
        // The engine owns edits, so the stream never reconciles against it.
        this.cache.set(Number(frameNumber), {
          frame_number: Number(frameNumber),
          ...fields,
        });
        landed++;
      }

      mergeRange(this.fetchedRanges, result.range);

      if (landed > 0) {
        this.notifyEdits();
      }
    } catch (error) {
      // Surface but don't crash — the engine will keep asking; subsequent
      // prefetch calls will retry the missing frames.
      console.error(
        `[VideoFrameLabelsStream] fetch failed for [${startFrame}, ${endFrame}]`,
        error,
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
  frameField: string,
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
    });
  }

  return out;
}

/**
 * Derive a detection's cross-frame overlay id for the read-only snapshot.
 * Prefers `instance._id` so tracked instances keep one identity across frames;
 * falls back to `track-${index}` for legacy data carrying only a numeric index,
 * then to the per-frame `_id` for untracked, un-instanced detections. `null`
 * when the detection carries no usable identifier.
 *
 * Note: this is the snapshot's synthetic scheme; the engine addresses tracks by
 * the raw `instance._id` (see `trackIdentity`).
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
