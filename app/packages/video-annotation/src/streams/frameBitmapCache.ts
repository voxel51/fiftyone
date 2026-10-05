/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/// <reference types="dom-webcodecs" />

/**
 * A decoded frame held in the cache. `meta` is stream-specific opaque payload
 * (dynamic group: `{ src }`; native: `{ timestamp }`) — the cache never reads it.
 */
export interface CachedFrameBitmap<M = unknown> {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  meta: M;
}

/**
 * Decoded frame bitmaps keyed by 1-indexed frame number. What stays is decided
 * by the surface's {@link FrameCache}, which deletes frames here when it evicts
 * them; on delete / overwrite / clear the `ImageBitmap` is `.close()`d so the
 * underlying GPU / native memory is freed immediately rather than waiting on GC.
 *
 * The one exception is the {@link pin}ned frame — the frame currently on
 * screen. Consumers draw a bitmap by reference, so closing it under eviction
 * would detach the image mid-draw. The pinned frame is exempt from the
 * close-on-delete and held by a strong reference here until it's unpinned.
 *
 * Shared by every {@link FrameBitmapStream} (the `/frames` image stream and the
 * WebCodecs video stream) so both get identical memory behaviour.
 */
export class FrameBitmapCache<M = unknown> {
  private readonly cache = new Map<number, CachedFrameBitmap<M>>();
  /** The frame currently on screen; exempt from close-on-evict. */
  private pinnedFrame: number | null = null;
  /** Strong ref to the pinned entry so it survives deletion from the map. */
  private pinnedEntry: CachedFrameBitmap<M> | null = null;

  get(frame: number): CachedFrameBitmap<M> | undefined {
    if (frame === this.pinnedFrame && this.pinnedEntry) {
      return this.pinnedEntry;
    }

    return this.cache.get(frame);
  }

  set(frame: number, entry: CachedFrameBitmap<M>): void {
    const previous = this.cache.get(frame);

    if (previous && previous !== entry) {
      this.dispose(frame, previous);
    }

    this.cache.set(frame, entry);
  }

  has(frame: number): boolean {
    return frame === this.pinnedFrame || this.cache.has(frame);
  }

  delete(frame: number): void {
    const entry = this.cache.get(frame);

    if (!entry) {
      return;
    }

    this.cache.delete(frame);
    this.dispose(frame, entry);
  }

  /** Close a dropped entry unless it is on screen; the pin closes that one. */
  private dispose(frame: number, entry: CachedFrameBitmap<M>): void {
    if (frame === this.pinnedFrame && entry === this.pinnedEntry) {
      return;
    }

    entry.bitmap.close();
  }

  /**
   * Pin the frame currently being displayed so eviction can't close its bitmap
   * underneath the renderer. Releases the previous pin (see
   * {@link releasePinned}). Takes a strong reference, so the frame is served
   * even after it is deleted.
   */
  pin(frame: number): void {
    if (frame === this.pinnedFrame) {
      return;
    }

    const entry = this.cache.get(frame) ?? null;
    this.releasePinned();
    this.pinnedFrame = frame;
    this.pinnedEntry = entry;
  }

  /** Drop the current pin, closing its bitmap if the map no longer holds it. */
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

    // If the map still holds this entry it owns the bitmap and closes it on a
    // later delete. If it was already dropped (the close was skipped because it
    // was pinned), this strong ref is the only one left — close it now.
    if (this.cache.get(frame) !== entry) {
      entry.bitmap.close();
    }
  }

  /** Drop every entry, closing each held bitmap. */
  clear(): void {
    const pinnedFrame = this.pinnedFrame;
    const pinnedEntry = this.pinnedEntry;
    this.pinnedFrame = null;
    this.pinnedEntry = null;

    // A pinned entry the map already dropped is held only here — close it. One
    // still in the map is closed below.
    if (
      pinnedEntry &&
      pinnedFrame !== null &&
      this.cache.get(pinnedFrame) !== pinnedEntry
    ) {
      pinnedEntry.bitmap.close();
    }

    for (const entry of this.cache.values()) {
      entry.bitmap.close();
    }

    this.cache.clear();
  }
}
