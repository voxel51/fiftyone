import { afterEach, describe, expect, it, vi } from "vitest";

import type { ByteSourceDescriptor } from "../../../ir";
import {
  createGridPosterCache,
  defaultGridPosterCacheBudgetBytes,
  gridPosterCacheKey,
  gridPosterFreshness,
  pointCloudPoseKey,
  shouldReplaceGridPoster,
  type GridPosterCacheEntry,
} from "./grid-poster-cache";

afterEach(() => vi.unstubAllGlobals());

describe("grid poster cache", () => {
  it("promotes hits and evicts by exact compressed byte accounting", () => {
    const cache = createGridPosterCache({ maxSizeBytes: 256 * 3 + 5 });
    cache.put("a", entry([1, 2]));
    cache.put("b", entry([3, 4]));
    expect(cache.get("a")?.bytes[0]).toBe(1);
    cache.put("c", entry([5, 6]));

    expect(cache.peek("a")).not.toBeNull();
    expect(cache.peek("b")).toBeNull();
    expect(cache.peek("c")).not.toBeNull();
    expect(cache.stats()).toMatchObject({
      entryCount: 2,
      evictions: 1,
      hits: 1,
      retainedBytes: 516,
    });
  });

  it("touches recency without changing hit diagnostics", () => {
    const cache = createGridPosterCache({ maxEntries: 2, maxSizeBytes: 1_000 });
    cache.put("a", entry([1]));
    cache.put("b", entry([2]));

    expect(cache.touch("a")?.bytes[0]).toBe(1);
    cache.put("c", entry([3]));

    expect(cache.peek("a")).not.toBeNull();
    expect(cache.peek("b")).toBeNull();
    expect(cache.stats()).toMatchObject({ hits: 0, misses: 0 });
  });

  it("replaces entries, rejects oversize values, and enforces the entry cap", () => {
    const cache = createGridPosterCache({ maxEntries: 2, maxSizeBytes: 1_000 });
    expect(cache.put("too-big", entry(new Array(745).fill(1)))).toBe(false);
    cache.put("a", entry([1]));
    cache.put("a", entry([2, 3]));
    cache.put("b", entry([4]));
    cache.put("c", entry([5]));

    expect(cache.peek("a")).toBeNull();
    expect(cache.stats()).toMatchObject({
      entryCount: 2,
      oversizeRejections: 1,
      puts: 4,
      replacements: 1,
    });
  });

  it("copies admitted bytes and stream metadata", () => {
    const bytes = new Uint8Array([1, 2]);
    const streams = ["/camera"];
    const cache = createGridPosterCache({ maxSizeBytes: 1_000 });
    cache.put("copy", { ...entry(bytes), streamSourceNames: streams });
    bytes[0] = 9;
    streams[0] = "/changed";

    expect(cache.get("copy")).toMatchObject({
      bytes: new Uint8Array([1, 2]),
      streamSourceNames: ["/camera"],
    });
  });

  it("separates every render-semantic key field", () => {
    const base = {
      datasetId: "dataset-a",
      mediaField: "recording",
      selectedSourceName: null,
      source: source("one", "etag-a"),
    };
    const key = gridPosterCacheKey(base);
    expect(gridPosterCacheKey({ ...base, datasetId: "dataset-b" })).not.toBe(
      key,
    );
    expect(gridPosterCacheKey({ ...base, mediaField: "other" })).not.toBe(key);
    expect(
      gridPosterCacheKey({ ...base, selectedSourceName: "/camera" }),
    ).not.toBe(key);
    expect(
      gridPosterCacheKey({ ...base, posterSourceName: "/camera/match" }),
    ).not.toBe(key);
    expect(gridPosterCacheKey({ ...base, posterStartTimeNs: 42n })).not.toBe(
      key,
    );
    expect(
      gridPosterCacheKey({ ...base, source: source("two", "etag-a") }),
    ).not.toBe(key);
    expect(
      gridPosterCacheKey({ ...base, source: source("one", "etag-b") }),
    ).not.toBe(key);
    expect(
      gridPosterCacheKey({
        ...base,
        source: { ...source("one", "etag-a"), sizeBytes: "2048" },
      }),
    ).not.toBe(key);
  });

  it("keeps signed access URLs out of persistent poster identity", () => {
    const base = {
      datasetId: "dataset-a",
      mediaField: "recording",
      selectedSourceName: null,
    };
    const first = gridPosterCacheKey({
      ...base,
      source: {
        sourceId: "sample-a",
        url: "https://objects.test/run.mcap?X-Amz-Signature=first",
      },
    });
    const rotated = gridPosterCacheKey({
      ...base,
      source: {
        sourceId: "sample-a",
        url: "https://cdn.test/run.mcap?X-Amz-Signature=second",
      },
    });
    const proxied = gridPosterCacheKey({
      ...base,
      mediaPath: "https://fiftyone.test/media?filepath=%2Fdatasets%2Frun.mcap",
      source: {
        sourceId: "sample-a",
        url: "https://fiftyone.test/rotating-access-path",
      },
    });

    expect(rotated).toBe(first);
    expect(proxied).toBe(first);
    expect(
      gridPosterCacheKey({
        ...base,
        source: { sourceId: "sample-a", url: "https://cdn.test/new.mcap" },
      }),
    ).not.toBe(first);
  });

  it("classifies size and complete point-cloud pose freshness without key variants", () => {
    const poseA = pointCloudPoseKey({ position: [1, 2, 3], target: [0, 0, 0] });
    const poseB = pointCloudPoseKey({ position: [1, 2, 4], target: [0, 0, 0] });
    const poster = entry([1], {
      height: 100,
      pointCloudPoseKey: poseA,
      sourceKind: "point-cloud",
      width: 200,
    });
    expect(
      gridPosterFreshness(poster, { height: 100, width: 200 }, poseA),
    ).toBe("fresh");
    expect(
      gridPosterFreshness(poster, { height: 101, width: 200 }, poseA),
    ).toBe("stale-size");
    expect(
      gridPosterFreshness(poster, { height: 100, width: 200 }, poseB),
    ).toBe("stale-pose");
    expect(
      shouldReplaceGridPoster(poster, {
        height: poster.height,
        mimeType: poster.mimeType,
        pointCloudPoseKey: poseB,
        sourceKind: poster.sourceKind,
        streamId: poster.streamId,
        streamSourceName: poster.streamSourceName,
        streamSourceNames: poster.streamSourceNames,
        width: poster.width,
      }),
    ).toBe(true);
    expect(
      shouldReplaceGridPoster(
        entry([1], { height: 200, width: 300 }),
        entry([2]),
      ),
    ).toBe(false);
    expect(
      shouldReplaceGridPoster(
        entry([1], { sourceKind: "image" }),
        entry([2], {
          pointCloudPoseKey: poseA,
          sourceKind: "point-cloud",
        }),
      ),
    ).toBe(true);
  });

  it("uses the fallback and adaptive browser budgets", () => {
    vi.stubGlobal("navigator", {});
    expect(defaultGridPosterCacheBudgetBytes()).toBe(64 * 1024 * 1024);
    vi.stubGlobal("navigator", { deviceMemory: 4 });
    expect(defaultGridPosterCacheBudgetBytes()).toBe(64 * 1024 * 1024);
    vi.stubGlobal("navigator", { deviceMemory: 16 });
    expect(defaultGridPosterCacheBudgetBytes()).toBe(128 * 1024 * 1024);
    vi.stubGlobal("navigator", { deviceMemory: 1 });
    expect(defaultGridPosterCacheBudgetBytes()).toBe(32 * 1024 * 1024);
  });
});

function entry(
  bytes: readonly number[] | Uint8Array,
  overrides: Partial<GridPosterCacheEntry> = {},
): GridPosterCacheEntry {
  return {
    bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    height: 20,
    mimeType: "image/webp",
    sourceKind: "image",
    streamId: "stream-id",
    streamSourceName: "/camera",
    streamSourceNames: ["/camera"],
    width: 30,
    ...overrides,
  };
}

function source(id: string, etag?: string): ByteSourceDescriptor {
  return { etag, sourceId: id, url: `https://example.test/${id}.mcap` };
}
