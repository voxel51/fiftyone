import { getFetchParameters, type Stage } from "@fiftyone/utilities";
import { LRUCache } from "lru-cache";
import { streamValueAtom } from "../../../playback/src/lib/playback/atoms";
import { PlaybackStreamBase } from "../../../playback/src/lib/playback/stream-base";
import type {
  BufferReadiness,
  PlaybackStore,
} from "../../../playback/src/lib/playback/types";
import { frameAt } from "../../../playback/src/lib/playback/utils";
import type {
  ChunkDoneMessage,
  ChunkFailedMessage,
  FrameReadyMessage,
  OutboundMessage,
} from "./framesWorker";

/**
 * What the stream publishes per tick. Consumers (the ImaVid tile) draw
 * `bitmap` into a canvas; `sampleId` and `frameNumber` are exposed for
 * commands / persistence that need to know which frame this is. `src`
 * is kept for debugging / dev-tools inspection — production rendering
 * does not use it.
 */
export interface ImaVidImageFrame {
  bitmap: ImageBitmap;
  src: string;
  sampleId: string;
  frameNumber: number;
}

/**
 * What we keep in the LRU. Decoded `ImageBitmap`s are sized by pixel
 * bytes; on eviction we call `.close()` to free the underlying GPU /
 * native memory immediately rather than waiting on GC.
 */
interface CachedFrame extends ImaVidImageFrame {
  sizeBytes: number;
}

export interface ImaVidImageStreamOptions {
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
   * Number of frames to request in a single `/frames` chunk. Larger
   * values mean fewer round trips but larger payloads.
   *
   * @default 60
   */
  chunkSize?: number;
  /**
   * Cap on cached pixel bytes. Defaults to 1 GB which matches looker's
   * ImaVid path. The LRU evicts the oldest frames first once this is
   * exceeded.
   *
   * @default 1e9
   */
  maxBytes?: number;
}

const DEFAULT_CHUNK_SIZE = 60;
const DEFAULT_MAX_BYTES = 1e9;

/**
 * Image stream backed by `POST /frames` for ImaVid-style playback
 * (i.e. `to_frames(sample_frames=True)` data, one materialized image
 * per frame).
 *
 * Both the JSON fetch and the per-image fetch+decode run inside a
 * `framesWorker` so the main thread never has to parse a `/frames`
 * response or decode an image. The worker transfers `ImageBitmap`s
 * back zero-copy; the tile renders them via `<canvas>` + `drawImage`.
 *
 * `bufferState` reports `ready` only after a frame's bitmap has landed
 * in the cache — so the engine never tries to render a half-decoded
 * frame.
 */
export class ImaVidImageStream extends PlaybackStreamBase<ImaVidImageFrame> {
  private readonly sampleId: string;
  private readonly dataset: string;
  private readonly view: Stage[];
  private readonly groupSlice: string | null;
  private readonly frameCount: number;
  private readonly frameRate: number;
  private readonly chunkSize: number;

  private readonly cache: LRUCache<number, CachedFrame>;
  private readonly inflight = new Map<number, InflightEntry>();
  /** reqId → frame numbers that request asked for. */
  private readonly requestFrames = new Map<number, number[]>();
  private readonly fetchedRanges: Array<[number, number]> = [];

  private readonly worker: Worker;
  private nextReqId = 1;
  private destroyed = false;

  constructor(opts: ImaVidImageStreamOptions) {
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
    this.chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;

    this.cache = new LRUCache<number, CachedFrame>({
      maxSize: opts.maxBytes ?? DEFAULT_MAX_BYTES,
      sizeCalculation: (entry) => entry.sizeBytes,
      dispose: (entry) => {
        // Free the underlying decoded pixels immediately. Without
        // .close(), the bitmap sits in GPU / native memory until GC
        // runs, which can push us well past the byte cap before
        // memory is actually reclaimed.
        entry.bitmap.close();
      },
    });

    this.worker = new Worker(new URL("./framesWorker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.addEventListener("message", this.handleWorkerMessage);

    // Hand the worker the same fetch context the main thread uses.
    // Normalize HeadersInit → Record<string, string> so it's structured-
    // cloneable (Headers objects and arrays both serialize fine, but
    // the worker side is simpler if it can spread headers verbatim).
    const params = getFetchParameters();
    this.worker.postMessage({
      type: "init",
      origin: params.origin,
      pathPrefix: params.pathPrefix,
      headers: normalizeHeaders(params.headers),
    });
  }

  /**
   * Resolve once the frame containing `time` has been fetched and
   * decoded. Use in tandem with `seek(time)` on mount so the first
   * paint isn't a blank tile waiting for the network.
   */
  async warmup(time = 0): Promise<void> {
    const frame = this.timeToFrame(time);
    if (this.cache.has(frame)) {
      return;
    }

    const existing = this.inflight.get(frame);
    if (existing) {
      await existing.promise;
      return;
    }

    this.requestChunkStartingAt(frame);
    const entry = this.inflight.get(frame);
    if (entry) {
      await entry.promise;
    }
  }

  /** Terminate the worker. Call when the stream is being replaced. */
  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    this.worker.removeEventListener("message", this.handleWorkerMessage);
    this.worker.terminate();

    // Settle anyone awaiting a frame that will never arrive.
    for (const entry of this.inflight.values()) {
      entry.resolve();
    }
    this.inflight.clear();
    this.requestFrames.clear();
    this.cache.clear();
  }

  /** Total frames in the clip. */
  get totalFrames(): number {
    return this.frameCount;
  }

  /** Frame rate in fps. */
  get fps(): number {
    return this.frameRate;
  }

  bufferState(time: number): BufferReadiness {
    const frame = this.timeToFrame(time);

    if (this.cache.has(frame)) {
      return "ready";
    }

    if (this.inflight.has(frame)) {
      return "loading";
    }

    return "missing";
  }

  prefetch(range: [number, number]): void {
    const [startSec, endSec] = range;
    const startFrame = this.timeToFrame(startSec);
    const endFrame = this.timeToFrame(endSec);

    // First missing frame wins — the engine re-calls prefetch as the
    // playhead advances, so we don't need to fan out here.
    for (let f = startFrame; f <= endFrame; f++) {
      if (this.cache.has(f) || this.inflight.has(f)) {
        continue;
      }

      this.requestChunkStartingAt(f);
      return;
    }
  }

  getValue(time: number): ImaVidImageFrame | null {
    const frame = this.timeToFrame(time);
    const entry = this.cache.get(frame);
    if (!entry) {
      return null;
    }

    return {
      bitmap: entry.bitmap,
      src: entry.src,
      sampleId: entry.sampleId,
      frameNumber: entry.frameNumber,
    };
  }

  /**
   * Custom `onCommit`: dedupe by `frameNumber`. The engine ticks several
   * times per frame; without dedupe each tick republishes an identical
   * value and kicks every `useStream` consumer into a re-render.
   */
  override onCommit(time: number, store: PlaybackStore): void {
    const next = this.getValue(time);
    const prev = store.get(streamValueAtom(this.id)) as ImaVidImageFrame | null;

    if (prev && next && prev.frameNumber === next.frameNumber) {
      return;
    }

    if (prev === null && next === null) {
      return;
    }

    // We're advancing to a new committed frame; proactively pull the next
    // chunk into flight so it lands before the playhead reaches it. The engine
    // only gives us a 1-frame warning, so we want to get ahead of that.
    if (next) {
      this.prefetch([time, time + this.lookaheadSeconds]);
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
    return frameAt(time, this.frameRate, this.frameCount);
  }

  private requestChunkStartingAt(startFrame: number): void {
    if (this.destroyed) {
      return;
    }

    const numFrames = Math.min(
      this.chunkSize,
      this.frameCount - startFrame + 1
    );
    if (numFrames <= 0) {
      return;
    }

    const reqId = this.nextReqId++;
    const frames: number[] = [];
    for (let f = startFrame; f < startFrame + numFrames; f++) {
      // Skip frames the cache already has or another request is fetching;
      // the worker doesn't dedupe so we have to.
      if (this.cache.has(f) || this.inflight.has(f)) {
        continue;
      }

      const entry = createInflightEntry();

      this.inflight.set(f, entry);
      frames.push(f);
    }

    if (frames.length === 0) {
      return;
    }

    this.requestFrames.set(reqId, frames);

    this.worker.postMessage({
      type: "fetchChunk",
      reqId,
      request: {
        frameNumber: startFrame,
        numFrames,
        frameCount: this.frameCount,
        sampleId: this.sampleId,
        dataset: this.dataset,
        view: this.view,
        slice: this.groupSlice ?? undefined,
      },
    });
  }

  private handleWorkerMessage = (
    event: MessageEvent<OutboundMessage>
  ): void => {
    const msg = event.data;
    switch (msg.type) {
      case "frameReady":
        this.onFrameReady(msg);
        break;
      case "chunkDone":
        this.onChunkDone(msg);
        break;
      case "chunkFailed":
        this.onChunkFailed(msg);
        break;
    }
  };

  private onFrameReady(msg: FrameReadyMessage): void {
    // If the stream was destroyed between request and reply, the bitmap
    // would leak — close it explicitly.
    if (this.destroyed) {
      msg.bitmap.close();
      return;
    }

    const sizeBytes = Math.max(1, msg.width * msg.height * 4);
    this.cache.set(msg.frameNumber, {
      bitmap: msg.bitmap,
      src: msg.src,
      sampleId: this.sampleId,
      frameNumber: msg.frameNumber,
      sizeBytes,
    });

    const entry = this.inflight.get(msg.frameNumber);
    if (entry) {
      entry.resolve();
      this.inflight.delete(msg.frameNumber);
    }
  }

  private onChunkDone(msg: ChunkDoneMessage): void {
    mergeRange(this.fetchedRanges, msg.range);
    this.resolveOutstandingFrames(msg.reqId);
  }

  private onChunkFailed(msg: ChunkFailedMessage): void {
    console.error(
      `[ImaVidImageStream] worker chunk ${msg.reqId} failed: ${msg.error}`
    );
    this.resolveOutstandingFrames(msg.reqId);
  }

  /**
   * Settle any in-flight frames from this request that never received
   * a `frameReady` (e.g. missing filepath, decode error, top-level
   * fetch failure). They drop from `loading` → `missing` so the engine
   * re-prefetches on the next tick. Anyone awaiting `warmup` unblocks
   * (the cache miss is observable via `bufferState`).
   */
  private resolveOutstandingFrames(reqId: number): void {
    const frames = this.requestFrames.get(reqId);
    if (!frames) {
      return;
    }

    this.requestFrames.delete(reqId);

    for (const f of frames) {
      const entry = this.inflight.get(f);
      if (!entry) {
        continue;
      }

      entry.resolve();
      this.inflight.delete(f);
    }
  }
}

interface InflightEntry {
  promise: Promise<void>;
  resolve: () => void;
}

function createInflightEntry(): InflightEntry {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

function normalizeHeaders(
  headers: HeadersInit | undefined
): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });

    return out;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...(headers as Record<string, string>) };
}

/**
 * Merge a newly-fetched `[start, end]` range into a sorted, disjoint
 * list of contiguous ranges.
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
