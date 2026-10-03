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

describe("FrameBitmapCache deletion", () => {
  it("closes a deleted bitmap that isn't on screen", () => {
    const cache = new FrameBitmapCache();
    const e1 = makeEntry();

    cache.set(1, e1);
    cache.delete(1);

    expect(e1.close).toHaveBeenCalledTimes(1);
    expect(cache.has(1)).toBe(false);
  });

  it("closes the bitmap an overwrite replaces", () => {
    const cache = new FrameBitmapCache();
    const e1 = makeEntry();

    cache.set(1, e1);
    cache.set(1, makeEntry());

    expect(e1.close).toHaveBeenCalledTimes(1);
  });
});

describe("FrameBitmapCache pinning", () => {
  it("does not close the pinned frame when it is deleted", () => {
    const cache = new FrameBitmapCache();
    const e1 = makeEntry();

    cache.set(1, e1);
    cache.pin(1); // frame 1 is on screen
    cache.delete(1);

    // Dropped from the map, but the bitmap stays alive and retrievable.
    expect(e1.close).not.toHaveBeenCalled();
    expect(cache.has(1)).toBe(true);
    expect(cache.get(1)).toBe(e1);
  });

  it("closes a deleted-while-pinned frame once it is unpinned", () => {
    const cache = new FrameBitmapCache();
    const e1 = makeEntry();

    cache.set(1, e1);
    cache.pin(1);
    cache.delete(1);

    cache.unpin();

    expect(e1.close).toHaveBeenCalledTimes(1);
    expect(cache.has(1)).toBe(false);
  });

  it("re-pinning the same frame is a no-op", () => {
    const cache = new FrameBitmapCache();
    const e1 = makeEntry();

    cache.set(1, e1);
    cache.pin(1);
    cache.pin(1);

    expect(e1.close).not.toHaveBeenCalled();
    expect(cache.get(1)).toBe(e1);
  });

  it("does not close a still-cached frame when the pin moves off it", () => {
    const cache = new FrameBitmapCache();
    const e1 = makeEntry();

    cache.set(1, e1);
    cache.pin(1);
    cache.set(2, makeEntry());
    cache.pin(2); // playhead advanced to frame 2

    expect(e1.close).not.toHaveBeenCalled();
    expect(cache.has(1)).toBe(true);
  });

  it("closes a deleted-while-pinned frame on clear", () => {
    const cache = new FrameBitmapCache();
    const e1 = makeEntry();
    const e2 = makeEntry();

    cache.set(1, e1);
    cache.pin(1);
    cache.set(2, e2);
    cache.delete(1);

    cache.clear();

    expect(e1.close).toHaveBeenCalledTimes(1);
    expect(e2.close).toHaveBeenCalledTimes(1);
  });
});
