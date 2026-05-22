import { getFetchFunction, type Stage } from "@fiftyone/utilities";
import { PlaybackStreamBase } from "../../playback/src/lib/playback/stream-base";
import { streamValueAtom } from "../../playback/src/lib/playback/atoms";
import type {
  BufferReadiness,
  PlaybackStore,
} from "../../playback/src/lib/playback/types";
import type { FrameLabelSnapshot, SyntheticBox } from "./SyntheticLabelStream";

/**
 * One per-frame document returned by `POST /frames`. We only model the
 * shape we touch; everything else is read through the dynamic indexer.
 */
interface FrameSample {
  frame_number: number;
  [key: string]: unknown;
}

interface FrameChunkResponse {
  frames: FrameSample[];
  range: [number, number];
}

// todo - adapter pattern for other label types
interface RawDetection {
  _id?: string;
  id?: string;
  index?: number;
  label?: string;
  bounding_box?: [number, number, number, number];
  instance?: { _cls: "Instance"; _id?: string } | null;
}

interface RawDetectionsField {
  detections?: RawDetection[];
}

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

  private readonly cache = new Map<number, FrameSample>();
  private readonly inflight = new Map<number, Promise<void>>();
  private readonly fetchedRanges: Array<[number, number]> = [];

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

  bufferState(time: number): BufferReadiness {
    const frame = this.timeToFrame(time);

    if (this.cache.has(frame)) {
      return "ready";
    }

    if (this.isInflight(frame)) {
      return "loading";
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
    const next = this.getValue(time);
    const prev = store.get(
      streamValueAtom(this.id)
    ) as FrameLabelSnapshot | null;

    if (prev && next && prev.frameNumber === next.frameNumber) {
      return;
    }

    if (prev === null && next === null) {
      return;
    }

    store.set(streamValueAtom(this.id), next);
  }

  bufferedRanges(): Array<[number, number]> {
    return this.fetchedRanges.map(
      ([start, end]) =>
        [(start - 1) / this.frameRate, end / this.frameRate] as [number, number]
    );
  }

  private timeToFrame(time: number): number {
    // Mirror @fiftyone/looker's getFrameNumber semantics: 1-indexed,
    // clamped to [1, frameCount].
    const frame = Math.floor(time * this.frameRate) + 1;
    if (frame < 1) {
      return 1;
    }

    if (frame > this.frameCount) {
      return this.frameCount;
    }

    return frame;
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
      const result = (await getFetchFunction()(
        "POST",
        "/frames",
        {
          frameNumber: startFrame,
          numFrames,
          frameCount: this.frameCount,
          sampleId: this.sampleId,
          dataset: this.dataset,
          view: this.view,
          slice: this.groupSlice ?? undefined,
        },
        "json",
        2
      )) as FrameChunkResponse;

      for (const frame of result.frames) {
        this.cache.set(frame.frame_number, frame);
      }

      mergeRange(this.fetchedRanges, result.range);
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
  sample: FrameSample,
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

    const detId = det._id ?? det.id ?? null;
    const id = det.index !== undefined ? `track-${det.index}` : detId;

    if (!id) {
      continue;
    }

    out.push({
      id,
      label: det.label ?? "",
      bounding_box: det.bounding_box,
      index: det.index,
      instance: det.instance ?? undefined,
    });
  }

  return out;
}

/**
 * Merge a newly-fetched `[start, end]` range into a sorted, disjoint list
 * of contiguous ranges.
 */
function mergeRange(
  ranges: Array<[number, number]>,
  add: [number, number]
): void {
  ranges.push(add);
  ranges.sort((a, b) => a[0] - b[0]);

  for (let i = ranges.length - 1; i > 0; i--) {
    const prev = ranges[i - 1];
    const cur = ranges[i];

    if (cur[0] <= prev[1] + 1) {
      prev[1] = Math.max(prev[1], cur[1]);
      ranges.splice(i, 1);
    }
  }
}
