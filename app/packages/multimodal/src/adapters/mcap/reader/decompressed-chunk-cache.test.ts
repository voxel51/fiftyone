import type { McapTypes } from "@mcap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  setMcapDecompressionCacheSink,
  type McapDecompressionCacheSample,
} from "../decompression-cache-meter";
import {
  createMcapDecompressedChunkCache,
  serializeMcapDecompressedChunkKey,
  type McapDecompressedChunkKey,
} from "./decompressed-chunk-cache";
import { mcapDecompressedChunkKeyForIndex } from "./chunk-records";

const key = (overrides: Partial<McapDecompressedChunkKey> = {}) => ({
  compressedLength: 4n,
  compressedOffset: 100n,
  compression: "zstd",
  decompressedSize: 8n,
  sourceKey: "source-a:version-1",
  ...overrides,
});

describe("MCAP decompressed chunk cache", () => {
  afterEach(() => setMcapDecompressionCacheSink(null));

  it("keeps stable range keys separate across sources and decoder inputs", () => {
    expect(serializeMcapDecompressedChunkKey(key())).toBe(
      serializeMcapDecompressedChunkKey(key()),
    );
    expect(
      new Set([
        serializeMcapDecompressedChunkKey(key()),
        serializeMcapDecompressedChunkKey(key({ sourceKey: "source-b" })),
        serializeMcapDecompressedChunkKey(key({ compressedOffset: 101n })),
        serializeMcapDecompressedChunkKey(key({ compressedLength: 5n })),
        serializeMcapDecompressedChunkKey(key({ compression: "lz4" })),
        serializeMcapDecompressedChunkKey(key({ decompressedSize: 9n })),
      ]).size,
    ).toBe(6);
  });

  it("keys an indexed chunk by its exact compressed payload slice", () => {
    expect(
      mcapDecompressedChunkKeyForIndex("source-a:version-1", {
        chunkStartOffset: 100n,
        compressedSize: 4n,
        compression: "zstd",
        uncompressedSize: 8n,
      } as McapTypes.TypedMcapRecords["ChunkIndex"]),
    ).toEqual({
      compressedLength: 4n,
      compressedOffset: 153n,
      compression: "zstd",
      decompressedSize: 8n,
      sourceKey: "source-a:version-1",
    });
  });

  it("shares one immutable output across paths and concurrent resumptions", async () => {
    const cache = createMcapDecompressedChunkCache(16);
    const load = vi.fn(() => ({
      bytes: new Uint8Array(8).fill(7),
      durationMs: 1,
    }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const read = async (path: "bounded-reader" | "indexed-message-reader") => {
      await gate;
      return cache.getOrLoad(key(), path, load);
    };
    const first = read("bounded-reader");
    const second = read("indexed-message-reader");
    release();

    const [left, right] = await Promise.all([first, second]);

    expect(right.bytes).toBe(left.bytes);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("evicts by decompressed bytes and reports exact residency", () => {
    const samples: McapDecompressionCacheSample[] = [];
    setMcapDecompressionCacheSink((sample) => samples.push(sample));
    const cache = createMcapDecompressedChunkCache(12);
    const load = () => ({ bytes: new Uint8Array(8), durationMs: 1 });

    cache.getOrLoad(key(), "bounded-reader", load);
    cache.getOrLoad(
      key({ compressedOffset: 200n }),
      "indexed-message-reader",
      load,
    );

    expect(samples.at(-1)).toMatchObject({
      cacheCapacityBytes: 12,
      cacheEvictedBytes: 8,
      cacheEvictions: 1,
      cacheResidentBytes: 8,
    });
  });

  it("does not retain failures or aborted loads", () => {
    const cache = createMcapDecompressedChunkCache();
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    expect(() =>
      cache.getOrLoad(key(), "bounded-reader", () => {
        throw aborted;
      }),
    ).toThrow(aborted);
    const load = vi.fn(() => ({
      bytes: new Uint8Array(8),
      durationMs: 1,
    }));

    expect(cache.getOrLoad(key(), "bounded-reader", load).bytes).toHaveLength(
      8,
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("clears on source version changes and rejects use after teardown", () => {
    const cache = createMcapDecompressedChunkCache();
    const load = vi.fn(() => ({
      bytes: new Uint8Array(8),
      durationMs: 1,
    }));
    cache.getOrLoad(key(), "bounded-reader", load);
    cache.getOrLoad(
      key({ sourceKey: "source-a:version-2" }),
      "bounded-reader",
      load,
    );
    cache.getOrLoad(key(), "bounded-reader", load);
    expect(load).toHaveBeenCalledTimes(3);

    cache.dispose();
    expect(() => cache.getOrLoad(key(), "bounded-reader", load)).toThrow(
      "disposed",
    );
  });

  it("rejects size mismatches without admitting the output", () => {
    const cache = createMcapDecompressedChunkCache();
    const invalid = vi.fn(() => ({
      bytes: new Uint8Array(7),
      durationMs: 1,
    }));
    expect(() => cache.getOrLoad(key(), "bounded-reader", invalid)).toThrow(
      "Expected 8 decompressed bytes",
    );
    const valid = vi.fn(() => ({
      bytes: new Uint8Array(8),
      durationMs: 1,
    }));
    cache.getOrLoad(key(), "bounded-reader", valid);
    expect(valid).toHaveBeenCalledOnce();
  });
});
