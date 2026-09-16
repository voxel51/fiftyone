/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Sizing chunked per-frame prefetch by bytes instead of frame count.
 *
 * Chunking is counted in FRAMES, but a frame is not a fixed cost. A uint8
 * segmentation mask is a few KiB where a float32 heatmap at media resolution is
 * megabytes; a decoded 1920x1200 bitmap is 9MB where a 640x480 one is 1.2MB. A
 * chunk size and a concurrency chosen for the small case ask for hundreds of
 * megabytes in the large one, which is why heavy sources buffer far worse than
 * everything else.
 *
 * So frames are the unit of the REQUEST and bytes are the unit of the BUDGET:
 * once a stream has seen what one frame actually costs, it shrinks its chunk,
 * its concurrency and how far it runs ahead to fit. Sources whose frames are
 * small never reach the ceiling and behave exactly as before.
 *
 * Shared by every stream that prefetches per-frame payloads, so the label
 * stream (bytes in flight on the wire) and the bitmap streams (bytes resident
 * in the decoded-frame cache) size their work the same way. What a frame costs
 * is measured by the caller, which alone knows its payload; everything derived
 * from that cost lives here.
 */

export interface FrameByteBudgetOptions {
  /** Bytes this budget governs. */
  budgetBytes: number;
  /** Frames a chunk requests while the cost is unknown or affordable. */
  chunkFrames: number;
  /** Frames in the clip; chunk lengths are clamped to it. */
  frameCount: number;
  /**
   * Smallest chunk the budget may shrink to. Below this the per-request
   * overhead dominates, and a stream fetching one frame at a time cannot stay
   * ahead of playback however small each fetch is.
   *
   * @default 1
   */
  minChunkFrames?: number;
  /**
   * Share of the budget one chunk may claim. A budget spent entirely on a
   * single claim leaves nothing for a second to overlap it, and nothing for
   * the frames already fetched but not yet shown.
   *
   * @default 0.5
   */
  chunkShare?: number;
  /**
   * Chunks the window is divided into, and so how many may be in flight at
   * once. More than one is what lets a chunk's fetch overlap the decode of
   * the chunk before it; the frames held ahead are the same either way.
   *
   * @default 1
   */
  maxConcurrency?: number;
}

export class FrameByteBudget {
  private readonly budgetBytes: number;
  private readonly configuredChunkFrames: number;
  private readonly frameCount: number;
  private readonly minChunkFrames: number;
  private readonly chunkShare: number;
  private readonly maxConcurrency: number;
  /** Observed cost of one frame; `undefined` until the caller measures one. */
  private observed?: number;

  constructor(options: FrameByteBudgetOptions) {
    this.budgetBytes = options.budgetBytes;
    this.configuredChunkFrames = options.chunkFrames;
    this.frameCount = options.frameCount;
    this.minChunkFrames = options.minChunkFrames ?? 1;
    this.chunkShare = options.chunkShare ?? 0.5;
    this.maxConcurrency = options.maxConcurrency ?? 1;
  }

  /**
   * Record what one frame cost. The latest observation wins outright:
   * averaging would smear the one transition that matters, a heavy field being
   * activated or a larger source loading, across several more oversized
   * claims. Values that measure nothing are ignored so a stale estimate is
   * never replaced by noise.
   */
  observe(bytesPerFrame: number): void {
    if (!Number.isFinite(bytesPerFrame) || bytesPerFrame <= 0) {
      return;
    }

    this.observed = Math.max(1, Math.round(bytesPerFrame));
  }

  /** Record a measured total spread over the frames it covered. */
  observeTotal(bytes: number, frames: number): void {
    if (!Number.isFinite(frames) || frames <= 0) {
      return;
    }

    this.observe(bytes / frames);
  }

  /** The cost estimate in force, or `undefined` before anything is measured. */
  get bytesPerFrame(): number | undefined {
    return this.observed;
  }

  /**
   * Frames one claim may hold, unbounded until a cost is known so a caller's
   * own lookahead governs until then. This is the ceiling on how far ahead of
   * the playhead a stream may work: past it, a cache evicts frames before they
   * are used, or requests queue behind each other on the wire.
   */
  windowFrames(): number {
    if (!this.observed) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.max(
      1,
      Math.floor((this.budgetBytes * this.chunkShare) / this.observed),
    );
  }

  /**
   * Frames to request per chunk: the window split into as many chunks as may
   * be in flight, so one is being fetched while another decodes.
   */
  chunkFrames(): number {
    if (!this.observed) {
      return this.configuredChunkFrames;
    }

    const perChunk = Math.max(
      1,
      Math.floor(this.windowFrames() / this.maxConcurrency),
    );

    return Math.max(
      this.minChunkFrames,
      Math.min(this.configuredChunkFrames, perChunk),
    );
  }

  /** Frames one chunk starting here would claim; `0` past the end of the clip. */
  chunkLengthAt(startFrame: number): number {
    return Math.max(
      0,
      Math.min(this.chunkFrames(), this.frameCount - startFrame + 1),
    );
  }

  /** Chunks to keep in flight, so their combined payload fits the budget. */
  concurrency(): number {
    if (!this.observed) {
      return this.maxConcurrency;
    }

    const perChunk = this.chunkFrames() * this.observed;

    // Always at least one: a frame costlier than the whole budget still has to
    // be fetched, just never alongside anything else.
    return Math.max(
      1,
      Math.min(this.maxConcurrency, Math.floor(this.budgetBytes / perChunk)),
    );
  }
}
