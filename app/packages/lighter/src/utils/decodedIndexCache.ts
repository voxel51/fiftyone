/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Decoded per-pixel indices, keyed by mask source, so a frame's mask can be
 * decoded ahead of the playhead (off the main thread) and found ready when
 * the overlay paints. The sibling of {@link MaskBitmapCache} for the palette
 * shader: it holds bare indices rather than a colored bitmap, because the
 * renderer colors them at draw time.
 *
 * A miss is not an error. The overlay decodes on the main thread and stores
 * the result, so the cache only ever removes work from the paint, never adds
 * a wait to it.
 */

import { LRUCache } from "lru-cache";

import type { DecodedHeatmap } from "./heatmapIndices";
import {
  decodeHeatmapIndicesAsync,
  decodeSegmentationIndicesAsync,
} from "./maskDecoding";
import type { DecodedSegmentation } from "./segmentationIndices";

/** Default cap — 128 MB of decoded indices, ~60 frames of 1080p 8-bit. */
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;

export class DecodedIndexCache<T extends object> {
  private readonly cache: LRUCache<string, T>;
  /** In-flight decodes, so concurrent warms share one worker round-trip. */
  private readonly inflight = new Map<string, Promise<void>>();

  /**
   * @param sizeOf - Bytes an entry occupies, for the cap.
   * @param maxBytes - Cap on decoded bytes held.
   */
  constructor(
    sizeOf: (entry: T) => number,
    maxBytes: number = DEFAULT_MAX_BYTES,
  ) {
    this.cache = new LRUCache<string, T>({
      maxSize: maxBytes,
      sizeCalculation: (entry) => Math.max(1, sizeOf(entry)),
    });
  }

  /** The decoded entry for a key, or `undefined` on a miss. */
  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  /** Remember a decode paid for elsewhere (the overlay's main-thread path). */
  set(key: string, entry: T): void {
    this.cache.set(key, entry);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  /** Whether a decode for this key is already in flight. */
  isWarming(key: string): boolean {
    return this.inflight.has(key);
  }

  /**
   * Run `decode` (off the main thread) and store its result under `key`.
   * Resolves once the entry is present or the decode has failed; failures are
   * the overlay's to report when it paints the frame, so they are swallowed
   * here.
   */
  warm(key: string, decode: () => Promise<T>): Promise<void> {
    if (this.cache.has(key)) {
      return Promise.resolve();
    }

    const pending = this.inflight.get(key);

    if (pending) {
      return pending;
    }

    const run = decode()
      .then((entry) => {
        this.cache.set(key, entry);
      })
      .catch(() => {
        // Reported at paint time by the overlay's own decode.
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, run);

    return run;
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
 * Process-wide caches. Overlays are rebuilt on every frame advance, so the
 * decode-ahead has to live somewhere that outlives them.
 */
export const segmentationIndexCache =
  new DecodedIndexCache<DecodedSegmentation>(
    (entry) => entry.indices.byteLength,
  );

export const heatmapIndexCache = new DecodedIndexCache<DecodedHeatmap>(
  (entry) => entry.indices.byteLength + entry.values.byteLength,
);

/**
 * A heatmap's indices depend on the range they were quantized over, so the
 * same map under two ranges is two entries.
 */
export const heatmapIndexKey = (
  source: string,
  range: readonly [number, number] | undefined,
): string => `${range ? `${range[0]},${range[1]}` : ""}|${source}`;

/** Decode an inline segmentation's indices ahead of its paint. */
export const warmSegmentationIndices = (source: string): Promise<void> =>
  segmentationIndexCache.warm(source, () =>
    decodeSegmentationIndicesAsync(source),
  );

/** Decode an inline heatmap's indices ahead of its paint. */
export const warmHeatmapIndices = (
  source: string,
  range: readonly [number, number] | undefined,
): Promise<void> =>
  heatmapIndexCache.warm(heatmapIndexKey(source, range), () =>
    decodeHeatmapIndicesAsync(source, range),
  );
