/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Decoded segmentation indices, keyed by mask source, so a frame's mask can be
 * decoded ahead of the playhead (off the main thread) and found ready when the
 * overlay paints. The sibling of {@link MaskBitmapCache} for the palette
 * shader: it holds bare indices rather than a colored bitmap, because the
 * renderer colors them at draw time.
 *
 * A miss is not an error. The overlay decodes on the main thread and stores
 * the result, so the cache only ever removes work from the paint, never adds
 * a wait to it.
 */

import { LRUCache } from "lru-cache";

import type { MaskSource } from "./maskBitmapCache";
import { decodeSegmentationIndicesAsync } from "./maskDecoding";
import type { DecodedSegmentation } from "./segmentationIndices";

/** Default cap — 128 MB of decoded indices, ~60 frames of 1080p 8-bit. */
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;

export class SegmentationIndexCache {
  private readonly cache: LRUCache<MaskSource, DecodedSegmentation>;
  /** In-flight decodes, so concurrent warms share one worker round-trip. */
  private readonly inflight = new Map<MaskSource, Promise<void>>();

  /** @param maxBytes - Cap on decoded index bytes held. */
  constructor(maxBytes: number = DEFAULT_MAX_BYTES) {
    this.cache = new LRUCache<MaskSource, DecodedSegmentation>({
      maxSize: maxBytes,
      sizeCalculation: (decoded) => Math.max(1, decoded.indices.byteLength),
    });
  }

  /** Decoded indices for a source, or `undefined` on a miss. */
  get(source: MaskSource): DecodedSegmentation | undefined {
    return this.cache.get(source);
  }

  /** Remember a decode paid for elsewhere (the overlay's main-thread path). */
  set(source: MaskSource, decoded: DecodedSegmentation): void {
    this.cache.set(source, decoded);
  }

  has(source: MaskSource): boolean {
    return this.cache.has(source);
  }

  /** Whether a decode for this source is already in flight. */
  isWarming(source: MaskSource): boolean {
    return this.inflight.has(source);
  }

  /**
   * Decode a source into the cache off the main thread. Resolves once the
   * entry is present or the decode has failed; failures are the overlay's to
   * report when it paints the frame, so they are swallowed here.
   */
  warm(source: MaskSource): Promise<void> {
    if (this.cache.has(source)) {
      return Promise.resolve();
    }

    const pending = this.inflight.get(source);

    if (pending) {
      return pending;
    }

    const decode = decodeSegmentationIndicesAsync(source)
      .then((decoded) => {
        this.cache.set(source, decoded);
      })
      .catch(() => {
        // Reported at paint time by the overlay's own decode.
      })
      .finally(() => {
        this.inflight.delete(source);
      });

    this.inflight.set(source, decode);

    return decode;
  }

  clear(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  /** Total bytes currently held. */
  get sizeBytes(): number {
    return this.cache.calculatedSize ?? 0;
  }
}

/**
 * Process-wide cache. Overlays are rebuilt on every frame advance, so the
 * decode-ahead has to live somewhere that outlives them.
 */
export const segmentationIndexCache = new SegmentationIndexCache();
