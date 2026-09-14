/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/// <reference types="dom-webcodecs" />

import {
  frameAt,
  PlaybackStreamBase,
  type BufferReadiness,
  type PlaybackStore,
} from "@fiftyone/playback";
import { FrameBitmapCache } from "./frameBitmapCache";
import { mergeRange, toSecondRanges } from "./fetchedRanges";
import type {
  ChunkDoneMessage,
  ChunkFailedMessage,
  FrameReadyMessage,
  FrameWorkerOutbound,
} from "./frameWorkerProtocol";

/**
 * What the stream publishes per committed frame. Consumers (the ImaVid tile,
 * SAM2 propagation) draw `bitmap`; `frameNumber` / `sampleId` identify which
 * frame this is for commands / persistence.
 */
export interface FrameBitmap {
  bitmap: ImageBitmap;
  frameNumber: number;
  sampleId: string;
}

export interface FrameBitmapStreamOptions {
  id: string;
  /** Sample id for the parent video document. */
  sampleId: string;
  /** Total frame count of the clip (1-indexed up to this number). */
  frameCount: number;
  /** Frame rate in frames per second. */
  frameRate: number;
  /**
   * Number of frames to request per chunk. Larger = fewer round trips, bigger
   * payloads.
   *
   * @default 60
   */
  chunkSize?: number;
  /**
   * Cap on cached pixel bytes.
   *
   * @default 1e9
   */
  maxBytes?: number;
}

const DEFAULT_CHUNK_SIZE = 60;

interface InflightEntry {
  promise: Promise<void>;
  resolve: () => void;
}

/**
 * Abstract chunked bitmap stream for ImaVid-style playback: a decode worker
 * fills an LRU of decoded frame bitmaps keyed by frame number, off the main
 * thread; the tile renders them one-per-commit via a single engine clock (so
 * media + overlays stay lock-step).
 *
 * This base owns everything source-agnostic — the LRU cache, the
 * inflight/failed/fetched-range bookkeeping, the buffer-readiness barrier,
 * prefetch / warmup / onCommit, and the shared worker message protocol.
 * Subclasses supply only the decode SOURCE:
 *
 * - {@link createWorker} — construct the worker (image `/frames` vs WebCodecs).
 * - {@link postInit} — send the source-specific `init` message.
 * - {@link buildChunkRequest} — the `fetchChunk` `request` payload.
 * - {@link toMeta} — derive the cached meta from a `frameReady`.
 * - {@link disposeSource} — optional extra teardown.
 *
 * `bufferState` reports `ready` only once a frame's bitmap has landed, so the
 * engine never renders a half-decoded frame.
 */
export abstract class FrameBitmapStream<
  M = unknown,
> extends PlaybackStreamBase<FrameBitmap> {
  protected readonly sampleId: string;
  protected readonly frameCount: number;
  protected readonly frameRate: number;
  protected readonly chunkSize: number;

  protected readonly cache: FrameBitmapCache<M>;
  private readonly inflight = new Map<number, InflightEntry>();
  /** reqId → frame numbers that request asked for. */
  private readonly requestFrames = new Map<number, number[]>();
  /**
   * Frames that settled without a bitmap — unresolvable source, decode error,
   * or a failed chunk. Terminal: never re-requested, so a bad frame can't drive
   * an infinite fetch loop. Cleared only on `destroy`.
   */
  private readonly failed = new Set<number>();
  private readonly fetchedRanges: Array<[number, number]> = [];

  private readonly worker: Worker;
  private initialized = false;
  private nextReqId = 1;
  private destroyed = false;

  constructor(opts: FrameBitmapStreamOptions) {
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
    this.frameCount = opts.frameCount;
    this.frameRate = opts.frameRate;
    this.chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this.cache = new FrameBitmapCache<M>(opts.maxBytes);

    // `createWorker` is field-independent (just `new Worker(url)`), so it's
    // safe to call from the base constructor before subclass fields are set.
    // `postInit` is deferred (see `ensureInit`) because it CAN read subclass
    // fields (e.g. the native stream's `videoSrc`), which aren't assigned until
    // the subclass constructor body runs after `super()`.
    this.worker = this.createWorker();
    this.worker.addEventListener("message", this.handleWorkerMessage);
  }

  // ---- subclass supplies the decode source -------------------------------

  /** Construct the decode worker. MUST NOT read subclass fields. */
  protected abstract createWorker(): Worker;

  /** Send the source-specific `init` message. Runs on first fetch. */
  protected abstract postInit(worker: Worker): void;

  /** Build the `fetchChunk` `request` payload for `[start, start+n)`. */
  protected abstract buildChunkRequest(
    startFrame: number,
    numFrames: number,
  ): unknown;

  /** Derive the cached meta from a `frameReady`. Default: the message's meta. */
  protected toMeta(msg: FrameReadyMessage): M {
    return (msg.meta ?? {}) as M;
  }

  /** Optional extra teardown (beyond terminating the worker). */
  protected disposeSource(): void {}

  // ---- shared machinery --------------------------------------------------

  /** Total frames in the clip. */
  get totalFrames(): number {
    return this.frameCount;
  }

  /** Frame rate in fps. */
  get fps(): number {
    return this.frameRate;
  }

  /**
   * Resolve once the frame containing `time` has been fetched + decoded. Use
   * with `seek(time)` on mount so the first paint isn't a blank tile.
   */
  async warmup(time = 0): Promise<void> {
    const frame = this.timeToFrame(time);
    if (this.cache.has(frame) || this.failed.has(frame)) {
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

  /** Terminate the worker + free the cache. Call when the stream is replaced. */
  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.disposeSource();

    this.worker.removeEventListener("message", this.handleWorkerMessage);
    this.worker.terminate();

    // Settle anyone awaiting a frame that will never arrive.
    for (const entry of this.inflight.values()) {
      entry.resolve();
    }
    this.inflight.clear();
    this.requestFrames.clear();
    this.failed.clear();
    this.cache.clear();
  }

  bufferState(time: number): BufferReadiness {
    const frame = this.timeToFrame(time);

    if (this.cache.has(frame)) {
      return "ready";
    }

    // A terminally-failed frame reports "ready" (it just has no bitmap): the
    // engine plays through to a blank frame instead of stalling forever and
    // re-issuing prefetch every tick.
    if (this.failed.has(frame)) {
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

    // First missing frame wins — the engine re-calls prefetch as the playhead
    // advances, so we don't fan out here.
    for (let f = startFrame; f <= endFrame; f++) {
      if (this.cache.has(f) || this.inflight.has(f) || this.failed.has(f)) {
        continue;
      }

      this.requestChunkStartingAt(f);
      return;
    }
  }

  getValue(time: number): FrameBitmap | null {
    const frame = this.timeToFrame(time);
    const entry = this.cache.get(frame);
    if (!entry) {
      return null;
    }

    return {
      bitmap: entry.bitmap,
      frameNumber: frame,
      sampleId: this.sampleId,
    };
  }

  /**
   * Dedupe by `frameNumber`. The engine ticks several times per frame; without
   * dedupe each tick republishes an identical value and re-renders every
   * consumer.
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

    // Pin the frame we're about to publish so the LRU can't close its bitmap
    // while the tile is still drawing it; unpin when we publish "no frame".
    if (next) {
      this.cache.pin(next.frameNumber);

      // Advancing to a new committed frame — proactively pull the next chunk
      // into flight so it lands before the playhead reaches it (the engine
      // only gives a 1-frame warning).
      this.prefetch([time, time + this.lookaheadSeconds]);
    } else {
      this.cache.unpin();
    }

    this.publish(store, next);
  }

  bufferedRanges(): Array<[number, number]> {
    return toSecondRanges(this.fetchedRanges, this.frameRate);
  }

  protected timeToFrame(time: number): number {
    return frameAt(time, this.frameRate, this.frameCount);
  }

  private ensureInit(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.postInit(this.worker);
  }

  private requestChunkStartingAt(startFrame: number): void {
    if (this.destroyed) {
      return;
    }

    this.ensureInit();

    const numFrames = Math.min(
      this.chunkSize,
      this.frameCount - startFrame + 1,
    );
    if (numFrames <= 0) {
      return;
    }

    const reqId = this.nextReqId++;
    const frames: number[] = [];
    for (let f = startFrame; f < startFrame + numFrames; f++) {
      // Skip frames the cache has, another request is fetching, or that failed
      // terminally; the worker doesn't dedupe so we have to.
      if (this.cache.has(f) || this.inflight.has(f) || this.failed.has(f)) {
        continue;
      }

      this.inflight.set(f, createInflightEntry());
      frames.push(f);
    }

    if (frames.length === 0) {
      return;
    }

    this.requestFrames.set(reqId, frames);
    this.worker.postMessage({
      type: "fetchChunk",
      reqId,
      request: this.buildChunkRequest(startFrame, numFrames),
    });
  }

  private handleWorkerMessage = (
    event: MessageEvent<FrameWorkerOutbound>,
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
    // If the stream was destroyed between request and reply, the bitmap would
    // leak — close it explicitly.
    if (this.destroyed) {
      msg.bitmap.close();
      return;
    }

    this.cache.set(msg.frameNumber, {
      bitmap: msg.bitmap,
      width: msg.width,
      height: msg.height,
      meta: this.toMeta(msg),
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
      `[FrameBitmapStream:${this.id}] worker chunk ${msg.reqId} failed: ${msg.error}`,
    );
    this.resolveOutstandingFrames(msg.reqId);
  }

  /**
   * Settle any in-flight frames from this request that never received a
   * `frameReady`. They're marked terminally `failed` so we never re-request
   * them (else the engine, seeing them perpetually un-ready, re-prefetches
   * every tick). Anyone awaiting `warmup` unblocks.
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

      this.failed.add(f);
      entry.resolve();
      this.inflight.delete(f);
    }
  }
}

function createInflightEntry(): InflightEntry {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}
