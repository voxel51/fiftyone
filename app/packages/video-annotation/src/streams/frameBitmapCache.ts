/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/// <reference types="dom-webcodecs" />

import { LRUCache } from "lru-cache";

/**
 * A decoded frame held in the cache. `meta` is stream-specific opaque payload
 * (imavid: `{ src }`; native: `{ timestamp }`) — the cache never reads it.
 */
export interface CachedFrameBitmap<M = unknown> {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  meta: M;
}

/** Default cache cap — 1 GB of decoded pixels, matching looker's ImaVid path. */
const DEFAULT_MAX_BYTES = 1e9;

/**
 * LRU of decoded frame bitmaps keyed by 1-indexed frame number. Entries are
 * sized by pixel bytes (`w * h * 4`); on eviction / overwrite / clear the
 * `ImageBitmap` is `.close()`d so the underlying GPU / native memory is freed
 * immediately rather than waiting on GC (decoded RGBA is large — without this
 * we blow well past the byte cap before memory is reclaimed).
 *
 * Shared by every {@link FrameBitmapStream} (the `/frames` image stream and the
 * WebCodecs video stream) so both get identical memory behaviour.
 */
export class FrameBitmapCache<M = unknown> {
  private readonly cache: LRUCache<number, CachedFrameBitmap<M>>;

  constructor(maxBytes: number = DEFAULT_MAX_BYTES) {
    this.cache = new LRUCache<number, CachedFrameBitmap<M>>({
      maxSize: maxBytes,
      sizeCalculation: (entry) => Math.max(1, entry.width * entry.height * 4),
      dispose: (entry) => {
        entry.bitmap.close();
      },
    });
  }

  get(frame: number): CachedFrameBitmap<M> | undefined {
    return this.cache.get(frame);
  }

  set(frame: number, entry: CachedFrameBitmap<M>): void {
    this.cache.set(frame, entry);
  }

  has(frame: number): boolean {
    return this.cache.has(frame);
  }

  delete(frame: number): void {
    this.cache.delete(frame);
  }

  /** Drop every entry, closing each held bitmap. */
  clear(): void {
    this.cache.clear();
  }
}
