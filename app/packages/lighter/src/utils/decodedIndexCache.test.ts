/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

import { DecodedIndexCache } from "./decodedIndexCache";

vi.mock("./maskDecoding", () => ({
  decodeSegmentationIndicesAsync: vi.fn(),
  decodeHeatmapIndicesAsync: vi.fn(),
}));

type Entry = ReturnType<typeof decoded>;

const mockedDecode = vi.fn<() => Promise<Entry>>();

const makeCache = (maxBytes?: number) =>
  new DecodedIndexCache<Entry>((entry) => entry.indices.byteLength, maxBytes);

const decoded = (width = 4, height = 4) => ({
  indices: new Uint8Array(width * height),
  width,
  height,
});

beforeEach(() => {
  mockedDecode.mockReset();
});

describe("DecodedIndexCache", () => {
  test("a warmed source is a synchronous hit", async () => {
    const cache = makeCache();
    const entry = decoded();
    mockedDecode.mockResolvedValueOnce(entry);

    expect(cache.get("mask-a")).toBeUndefined();

    await cache.warm("mask-a", mockedDecode);

    // The overlay reads this from inside a paint and cannot wait.
    expect(cache.get("mask-a")).toBe(entry);
    expect(cache.has("mask-a")).toBe(true);
    expect(mockedDecode).toHaveBeenCalledTimes(1);
  });

  test("concurrent warms of one source share a single decode", async () => {
    const cache = makeCache();
    let settle: ((value: ReturnType<typeof decoded>) => void) | undefined;
    mockedDecode.mockReturnValueOnce(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    const first = cache.warm("mask-a", mockedDecode);
    const second = cache.warm("mask-a", mockedDecode);

    expect(cache.isWarming("mask-a")).toBe(true);
    expect(mockedDecode).toHaveBeenCalledTimes(1);

    settle?.(decoded());
    await Promise.all([first, second]);

    expect(cache.isWarming("mask-a")).toBe(false);
    expect(cache.has("mask-a")).toBe(true);
  });

  test("a warm that is already resident does not decode again", async () => {
    const cache = makeCache();
    cache.set("mask-a", decoded());

    await cache.warm("mask-a", mockedDecode);

    expect(mockedDecode).not.toHaveBeenCalled();
  });

  test("a failed warm resolves and leaves a miss", async () => {
    const cache = makeCache();
    mockedDecode.mockRejectedValueOnce(new Error("bad mask"));

    // The overlay reports the failure when it decodes at paint time; the
    // warm must neither throw nor poison the cache.
    await expect(cache.warm("mask-a", mockedDecode)).resolves.toBeUndefined();

    expect(cache.has("mask-a")).toBe(false);
    expect(cache.isWarming("mask-a")).toBe(false);
  });

  test("evicts the least recently used entry past the byte cap", () => {
    // Room for two 16-byte entries, not three.
    const cache = makeCache(40);

    cache.set("mask-a", decoded());
    cache.set("mask-b", decoded());
    cache.get("mask-a");
    cache.set("mask-c", decoded());

    expect(cache.has("mask-a")).toBe(true);
    expect(cache.has("mask-b")).toBe(false);
    expect(cache.has("mask-c")).toBe(true);
    expect(cache.sizeBytes).toBe(32);
  });
});
