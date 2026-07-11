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
 * The one exception is the {@link pin}ned frame — the frame currently on
 * screen. Consumers draw a bitmap by reference, so closing it under eviction
 * would detach the image mid-draw. The pinned frame is exempt from the
 * close-on-evict and held by a strong reference here until it's unpinned, so
 * it survives even when the LRU drops it under budget pressure.
 *
 * Shared by every {@link FrameBitmapStream} (the `/frames` image stream and the
 * WebCodecs video stream) so both get identical memory behaviour.
 */
export class FrameBitmapCache<M = unknown> {
  private readonly cache: LRUCache<number, CachedFrameBitmap<M>>;
  /** The frame currently on screen; exempt from close-on-evict. */
  private pinnedFrame: number | null = null;
  /** Strong ref to the pinned entry so it survives eviction from the LRU. */
  private pinnedEntry: CachedFrameBitmap<M> | null = null;
  /** DEBUG: when set, {@link pin} is a no-op (reproduces the pre-fix crash). */
  private readonly pinDisabled: boolean;

  constructor(maxBytes: number = DEFAULT_MAX_BYTES, pinDisabled = false) {
    this.pinDisabled = pinDisabled;

    this.cache = new LRUCache<number, CachedFrameBitmap<M>>({
      maxSize: maxBytes,
      sizeCalculation: (entry) => Math.max(1, entry.width * entry.height * 4),
      dispose: (entry, key) => {
        // Never close the frame on screen; the renderer still holds it and may
        // redraw it. `pinnedEntry` keeps it alive; `releasePinned` closes it
        // once the playhead moves on.
        if (key === this.pinnedFrame) {
          return;
        }

        entry.bitmap.close();
      },
    });
  }

  get(frame: number): CachedFrameBitmap<M> | undefined {
    if (frame === this.pinnedFrame && this.pinnedEntry) {
      return this.pinnedEntry;
    }

    return this.cache.get(frame);
  }

  set(frame: number, entry: CachedFrameBitmap<M>): void {
    this.cache.set(frame, entry);
  }

  has(frame: number): boolean {
    return frame === this.pinnedFrame || this.cache.has(frame);
  }

  delete(frame: number): void {
    if (frame === this.pinnedFrame) {
      this.releasePinned();
    }

    this.cache.delete(frame);
  }

  /**
   * Pin the frame currently being displayed so eviction can't close its bitmap
   * underneath the renderer. Releases the previous pin (see
   * {@link releasePinned}). Refreshes the frame's recency and takes a strong
   * reference, so the frame is served even after the LRU drops it under budget
   * pressure.
   */
  pin(frame: number): void {
    if (this.pinDisabled || frame === this.pinnedFrame) {
      return;
    }

    const entry = this.cache.get(frame) ?? null;
    this.releasePinned();
    this.pinnedFrame = frame;
    this.pinnedEntry = entry;
  }

  /** Drop the current pin, closing its bitmap if the LRU no longer holds it. */
  unpin(): void {
    this.releasePinned();
  }

  private releasePinned(): void {
    const frame = this.pinnedFrame;
    const entry = this.pinnedEntry;
    this.pinnedFrame = null;
    this.pinnedEntry = null;

    if (frame === null || !entry) {
      return;
    }

    // If the LRU still holds this frame it owns the bitmap and will close it on
    // a future eviction. If eviction already dropped it (dispose skipped the
    // close because it was pinned), this strong ref is the only one left —
    // close it now so the memory is reclaimed.
    if (!this.cache.has(frame)) {
      entry.bitmap.close();
    }
  }

  /** Drop every entry, closing each held bitmap. */
  clear(): void {
    const pinnedFrame = this.pinnedFrame;
    const pinnedEntry = this.pinnedEntry;
    this.pinnedFrame = null;
    this.pinnedEntry = null;

    // A pinned frame the LRU already dropped is held only here — close it. One
    // still in the LRU is closed by `cache.clear()` below.
    if (pinnedEntry && pinnedFrame !== null && !this.cache.has(pinnedFrame)) {
      pinnedEntry.bitmap.close();
    }

    this.cache.clear();
  }
}
