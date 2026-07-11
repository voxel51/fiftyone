/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import { CachedFrameBitmap, FrameBitmapCache } from "./frameBitmapCache";

/**
 * A fake `ImageBitmap` whose `close()` is a spy. The cache only ever calls
 * `close()` and reads the entry's own `width`/`height`, so this stands in.
 */
function makeEntry(
  size = 5,
): CachedFrameBitmap & { close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  const bitmap = { close, width: size, height: size } as unknown as ImageBitmap;
  return { bitmap, width: size, height: size, meta: {}, close };
}

/** A 5x5 entry is 100 bytes; this budget holds two of them. */
const TWO_FRAME_BUDGET = 250;

describe("FrameBitmapCache eviction", () => {
  it("closes non-pinned bitmaps when evicted under budget pressure", () => {
    const cache = new FrameBitmapCache(TWO_FRAME_BUDGET);
    const e1 = makeEntry();
    const e2 = makeEntry();
    const e3 = makeEntry();

    cache.set(1, e1);
    cache.set(2, e2);
    cache.set(3, e3); // evicts frame 1 (least-recently-used)

    expect(e1.close).toHaveBeenCalledTimes(1);
    expect(cache.has(1)).toBe(false);
    expect(e2.close).not.toHaveBeenCalled();
    expect(e3.close).not.toHaveBeenCalled();
  });
});

describe("FrameBitmapCache pinning", () => {
  it("does not close the pinned frame when the LRU evicts it", () => {
    const cache = new FrameBitmapCache(TWO_FRAME_BUDGET);
    const e1 = makeEntry();
    const e2 = makeEntry();
    const e3 = makeEntry();

    cache.set(1, e1);
    cache.pin(1); // frame 1 is on screen
    cache.set(2, e2);
    cache.set(3, e3); // would evict frame 1, but it's pinned

    // The LRU dropped it, but the bitmap stays alive and retrievable.
    expect(e1.close).not.toHaveBeenCalled();
    expect(cache.has(1)).toBe(true);
    expect(cache.get(1)).toBe(e1);
  });

  it("closes the previously-pinned frame once it falls out of the LRU and is unpinned", () => {
    const cache = new FrameBitmapCache(TWO_FRAME_BUDGET);
    const e1 = makeEntry();

    cache.set(1, e1);
    cache.pin(1);
    cache.set(2, makeEntry());
    cache.set(3, makeEntry()); // frame 1 evicted from LRU but pinned-alive

    cache.unpin();

    expect(e1.close).toHaveBeenCalledTimes(1);
    expect(cache.has(1)).toBe(false);
  });

  it("re-pinning the same frame is a no-op", () => {
    const cache = new FrameBitmapCache(TWO_FRAME_BUDGET);
    const e1 = makeEntry();

    cache.set(1, e1);
    cache.pin(1);
    cache.pin(1);

    expect(e1.close).not.toHaveBeenCalled();
    expect(cache.get(1)).toBe(e1);
  });

  it("does not close a still-cached frame when the pin moves off it", () => {
    // Budget holds both frames, so moving the pin leaves frame 1 in the LRU;
    // the cache still owns it and must not close it early.
    const cache = new FrameBitmapCache(TWO_FRAME_BUDGET);
    const e1 = makeEntry();
    const e2 = makeEntry();

    cache.set(1, e1);
    cache.pin(1);
    cache.set(2, e2);
    cache.pin(2); // playhead advanced to frame 2

    expect(e1.close).not.toHaveBeenCalled();
    expect(cache.has(1)).toBe(true);
  });

  it("closes an evicted-while-pinned frame on clear", () => {
    const cache = new FrameBitmapCache(TWO_FRAME_BUDGET);
    const e1 = makeEntry();
    const e2 = makeEntry();

    cache.set(1, e1);
    cache.pin(1);
    cache.set(2, e2);
    cache.set(3, makeEntry()); // frame 1 evicted from LRU, pinned-alive

    cache.clear();

    expect(e1.close).toHaveBeenCalledTimes(1);
    expect(e2.close).toHaveBeenCalledTimes(1);
  });

  it("with pinning disabled, closes the on-screen frame on eviction (pre-fix behaviour)", () => {
    const cache = new FrameBitmapCache(
      TWO_FRAME_BUDGET,
      /* pinDisabled */ true,
    );
    const e1 = makeEntry();

    cache.set(1, e1);
    cache.pin(1); // no-op when disabled
    cache.set(2, makeEntry());
    cache.set(3, makeEntry()); // evicts frame 1 and closes it, still "on screen"

    expect(e1.close).toHaveBeenCalledTimes(1);
    expect(cache.has(1)).toBe(false);
  });
});
