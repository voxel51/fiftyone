import { getSampleSrc } from "@fiftyone/state";
import { type Stage } from "@fiftyone/utilities";
import { LRUCache } from "lru-cache";
import { getFrames, type FrameDoc } from "../../core/src/client/framesClient";
import { streamValueAtom } from "../../playback/src/lib/playback/atoms";
import { PlaybackStreamBase } from "../../playback/src/lib/playback/stream-base";
import type {
  BufferReadiness,
  PlaybackStore,
} from "../../playback/src/lib/playback/types";
import { frameAt } from "../../playback/src/lib/playback/utils";

/**
 * What the stream publishes per tick. Consumers (the ImaVid tile)
 * bind `<img src={value.src}>`; `sampleId` and `frameNumber` are exposed
 * for commands / persistence that need to know which frame this is.
 */
export interface ImaVidImageFrame {
  src: string;
  sampleId: string;
  frameNumber: number;
}

/**
 * What we keep in the LRU. We hold the decoded `HTMLImageElement` alive
 * (not just the src) so a frame reuse doesn't trigger a fresh network
 * + decode.
 */
interface CachedFrame extends ImaVidImageFrame {
  image: HTMLImageElement;
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
 * per frame). Reads `filepath` off each per-frame doc, resolves it
 * via `getSampleSrc`, decodes via `new Image()`, and caches the
 * decoded image in an LRU sized by pixel bytes.
 *
 * `bufferState` returns `ready` only after a frame has fully decoded,
 * so the engine never tries to render half-loaded frames.
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
  /** Per-frame decode promises — one slot per frame, shared across callers. */
  private readonly inflight = new Map<number, Promise<void>>();
  private readonly fetchedRanges: Array<[number, number]> = [];

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
    });
  }

  /**
   * Resolve once the frame containing `time` has been fetched and decoded.
   * Use in tandem with `seek(time)` on mount so the first paint isn't a
   * blank `<img>` waiting for the network.
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

    await this.fetchAndDecodeChunk(frame);
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

      void this.fetchAndDecodeChunk(f);
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

  private async fetchAndDecodeChunk(startFrame: number): Promise<void> {
    const numFrames = Math.min(
      this.chunkSize,
      this.frameCount - startFrame + 1
    );
    if (numFrames <= 0) {
      return;
    }

    // One Promise covers fetch + decode for every frame in the chunk.
    // Each frame's `inflight` slot points at this same promise so
    // bufferState reports "loading" uniformly across the range.
    const promise = this.runChunk(startFrame, numFrames).finally(() => {
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

  private async runChunk(startFrame: number, numFrames: number): Promise<void> {
    let result: Awaited<ReturnType<typeof getFrames>>;
    try {
      result = await getFrames({
        frameNumber: startFrame,
        numFrames,
        frameCount: this.frameCount,
        sampleId: this.sampleId,
        dataset: this.dataset,
        view: this.view,
        slice: this.groupSlice ?? undefined,
      });
    } catch (error) {
      // Subsequent prefetch calls retry the same range; leaving the
      // cache untouched lets that happen naturally.
      console.error(
        `[ImaVidImageStream] fetch failed for [${startFrame}, +${numFrames})`,
        error
      );
      return;
    }

    mergeRange(this.fetchedRanges, result.range);

    // Decode in parallel; one slow image shouldn't block the rest of
    // the chunk from becoming ready.
    await Promise.all(result.frames.map((frame) => this.decodeAndCache(frame)));
  }

  private async decodeAndCache(frame: FrameDoc): Promise<void> {
    if (!frame.filepath || typeof frame.filepath !== "string") {
      return;
    }

    const src = getSampleSrc(frame.filepath);
    const image = new Image();

    try {
      await new Promise<void>((resolve, reject) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener(
          "error",
          () => reject(new Error(`image load failed: ${src}`)),
          { once: true }
        );
        image.src = src;
      });
    } catch (error) {
      console.error(
        `[ImaVidImageStream] decode failed for frame ${frame.frame_number}`,
        error
      );
      return;
    }

    // RGBA pixel bytes — close enough for LRU sizing without holding
    // an offscreen canvas open to count exact decoded bytes.
    const sizeBytes = Math.max(1, image.naturalWidth * image.naturalHeight * 4);

    this.cache.set(frame.frame_number, {
      src,
      sampleId: this.sampleId,
      frameNumber: frame.frame_number,
      image,
      sizeBytes,
    });
  }
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
