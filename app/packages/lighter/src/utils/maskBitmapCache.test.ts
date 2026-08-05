/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

import { MaskBitmapCache } from "./maskBitmapCache";
import { decodeMask } from "./maskDecoding";

vi.mock("./maskDecoding", () => ({ decodeMask: vi.fn() }));

const mockedDecodeMask = vi.mocked(decodeMask);

/** A decode result whose bitmap records its own `close()`. */
const decoded = (width = 10, height = 10) => {
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;

  return {
    bitmap,
    rawPixels: { src: new Uint8Array(width * height), width, height },
  };
};

/** Bytes one `decoded(w, h)` entry occupies, per the cache's accounting. */
const bytesFor = (width: number, height: number) => width * height * 5;

beforeEach(() => {
  mockedDecodeMask.mockReset();
});

describe("MaskBitmapCache", () => {
  test("a repeat source is a synchronous hit — no second decode", async () => {
    const cache = new MaskBitmapCache();
    const first = decoded();
    mockedDecodeMask.mockResolvedValueOnce(first);

    await cache.acquireAsync("mask-a");

    // The frame-advance path calls `acquire` from inside render and must be
    // able to draw the result in that same tick.
    const hit = cache.acquire("mask-a");

    expect(hit).toBe(first);
    expect(mockedDecodeMask).toHaveBeenCalledTimes(1);
  });

  test("distinct sources are distinct entries", async () => {
    const cache = new MaskBitmapCache();
    mockedDecodeMask
      .mockResolvedValueOnce(decoded())
      .mockResolvedValueOnce(decoded());

    const a = await cache.acquireAsync("mask-a");
    const b = await cache.acquireAsync("mask-b");

    expect(a).not.toBe(b);
    expect(mockedDecodeMask).toHaveBeenCalledTimes(2);
  });

  test("an edited mask is a different source, so it misses", async () => {
    const cache = new MaskBitmapCache();
    mockedDecodeMask
      .mockResolvedValueOnce(decoded())
      .mockResolvedValueOnce(decoded());

    await cache.acquireAsync("mask-a");
    await cache.acquireAsync("mask-a-after-paint");

    expect(mockedDecodeMask).toHaveBeenCalledTimes(2);
  });

  test("an unchanged mask repeated across frames shares one entry", async () => {
    const cache = new MaskBitmapCache();
    const only = decoded();
    mockedDecodeMask.mockResolvedValueOnce(only);

    // Equal base64 built independently — a track holding still across frames,
    // serialized once per frame. String keys compare by value, so both frames
    // draw the same bitmap, which is sound because a decode is a pure function
    // of its source.
    const frameOne = "mask-a";
    const frameTwo = ["mask", "a"].join("-");

    const a = await cache.acquireAsync(frameOne);
    const b = await cache.acquireAsync(frameTwo);

    expect(mockedDecodeMask).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  test("a miss returns undefined rather than blocking", () => {
    const cache = new MaskBitmapCache();

    expect(cache.acquire("never-decoded")).toBeUndefined();
    expect(mockedDecodeMask).not.toHaveBeenCalled();
  });

  test("concurrent callers share one decode and one bitmap", async () => {
    const cache = new MaskBitmapCache();
    const only = decoded();
    mockedDecodeMask.mockResolvedValueOnce(only);

    const [a, b] = await Promise.all([
      cache.acquireAsync("mask-a"),
      cache.acquireAsync("mask-a"),
    ]);

    expect(mockedDecodeMask).toHaveBeenCalledTimes(1);
    expect(a).toBe(only);
    expect(b).toBe(only);
  });

  test("an evicted entry with no borrowers is closed", async () => {
    // Budget fits exactly one 10x10 entry.
    const cache = new MaskBitmapCache(bytesFor(10, 10));
    const first = decoded();
    mockedDecodeMask
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(decoded());

    await cache.acquireAsync("mask-a");
    cache.release("mask-a");

    await cache.acquireAsync("mask-b");

    expect(first.bitmap.close).toHaveBeenCalled();
    expect(cache.acquire("mask-a")).toBeUndefined();
  });

  test("an evicted entry that is still borrowed stays open until released", async () => {
    const cache = new MaskBitmapCache(bytesFor(10, 10));
    const first = decoded();
    mockedDecodeMask
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(decoded());

    // Borrow and hold — an overlay mid-draw.
    await cache.acquireAsync("mask-a");

    // Evict it under budget pressure.
    await cache.acquireAsync("mask-b");

    // Drawing a closed ImageBitmap throws at texture upload, so the borrow has
    // to outlive eviction.
    expect(first.bitmap.close).not.toHaveBeenCalled();

    cache.release("mask-a");

    expect(first.bitmap.close).toHaveBeenCalled();
  });

  test("closes only when the last borrower releases", async () => {
    const cache = new MaskBitmapCache(bytesFor(10, 10));
    const first = decoded();
    mockedDecodeMask
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(decoded());

    await cache.acquireAsync("mask-a");
    cache.acquire("mask-a");

    await cache.acquireAsync("mask-b");

    cache.release("mask-a");
    expect(first.bitmap.close).not.toHaveBeenCalled();

    cache.release("mask-a");
    expect(first.bitmap.close).toHaveBeenCalled();
  });

  test("a released, still-cached entry is reusable rather than closed", async () => {
    const cache = new MaskBitmapCache();
    const first = decoded();
    mockedDecodeMask.mockResolvedValueOnce(first);

    await cache.acquireAsync("mask-a");
    cache.release("mask-a");

    expect(first.bitmap.close).not.toHaveBeenCalled();
    expect(cache.acquire("mask-a")).toBe(first);
  });

  test("a mask larger than the whole cap is still closed on release", async () => {
    // The LRU silently refuses an oversize entry, so nothing would track it and
    // its bitmap would leak. Reachable whenever the cap is shrunk for testing.
    const cache = new MaskBitmapCache(bytesFor(4, 4));
    const oversize = decoded(100, 100);
    mockedDecodeMask.mockResolvedValueOnce(oversize);

    const borrowed = await cache.acquireAsync("huge");

    expect(borrowed).toBe(oversize);
    expect(oversize.bitmap.close).not.toHaveBeenCalled();

    cache.release("huge");

    expect(oversize.bitmap.close).toHaveBeenCalled();
  });

  test("stats separate real decodes from cache hits", async () => {
    const cache = new MaskBitmapCache();
    mockedDecodeMask
      .mockResolvedValueOnce(decoded())
      .mockResolvedValueOnce(decoded());

    await cache.acquireAsync("mask-a");
    cache.acquire("mask-a");
    await cache.acquireAsync("mask-b");

    const stats = cache.stats();

    // Decodes far exceeding the clip's distinct mask count across a loop is the
    // signature of a working set that doesn't fit.
    expect(stats.decodes).toBe(2);
    expect(stats.hits).toBe(1);
    expect(stats.entries).toBe(2);
  });

  test("warm decodes into the cache without retaining a borrow", async () => {
    const cache = new MaskBitmapCache(bytesFor(10, 10));
    const first = decoded();
    mockedDecodeMask
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(decoded());

    await cache.warm("mask-a");

    expect(cache.has("mask-a")).toBe(true);

    // Holding no reference, a warmed entry is evictable like any other —
    // otherwise decode-ahead would pin the whole lookahead window.
    await cache.acquireAsync("mask-b");

    expect(first.bitmap.close).toHaveBeenCalled();
  });

  test("clear keeps borrowed entries alive but drops the rest", async () => {
    const cache = new MaskBitmapCache();
    const held = decoded();
    const free = decoded();
    mockedDecodeMask.mockResolvedValueOnce(held).mockResolvedValueOnce(free);

    await cache.acquireAsync("held");
    await cache.acquireAsync("free");
    cache.release("free");

    cache.clear();

    expect(free.bitmap.close).toHaveBeenCalled();
    expect(held.bitmap.close).not.toHaveBeenCalled();

    cache.release("held");
    expect(held.bitmap.close).toHaveBeenCalled();
  });
});
