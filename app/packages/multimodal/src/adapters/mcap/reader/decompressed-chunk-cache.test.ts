import { describe, expect, it, vi } from "vitest";
import {
  createMcapDecompressedChunkCache,
  serializeMcapDecompressedChunkKey,
  type McapDecompressedChunkKey,
} from "./decompressed-chunk-cache";
import { mcapDecompressedChunkKeyForIndex } from "./chunk-records";
import type { McapChunkIndex } from "./types";

const key = (overrides: Partial<McapDecompressedChunkKey> = {}) => ({
  compressedLength: 4n,
  compressedOffset: 100n,
  compression: "zstd",
  decompressedSize: 8n,
  sourceKey: "source-a:version-1",
  ...overrides,
});

describe("MCAP decompressed chunk cache", () => {
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
        chunkLength: 57n,
        chunkStartOffset: 100n,
        compressedSize: 4n,
        compression: "zstd",
        messageEndTime: 0n,
        messageIndexLength: 0n,
        messageIndexOffsets: new Map<number, bigint>(),
        messageStartTime: 0n,
        type: "ChunkIndex",
        uncompressedSize: 8n,
      } satisfies McapChunkIndex),
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
    }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const read = async () => {
      await gate;
      return cache.getOrLoad(key(), load);
    };
    const first = read();
    const second = read();
    release();

    const [left, right] = await Promise.all([first, second]);

    expect(right.bytes).toBe(left.bytes);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("evicts by decompressed bytes", () => {
    const cache = createMcapDecompressedChunkCache(12);
    const load = vi.fn(() => ({ bytes: new Uint8Array(8) }));

    cache.getOrLoad(key(), load);
    cache.getOrLoad(key({ compressedOffset: 200n }), load);
    cache.getOrLoad(key(), load);

    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not retain failures or aborted loads", () => {
    const cache = createMcapDecompressedChunkCache();
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    expect(() =>
      cache.getOrLoad(key(), () => {
        throw aborted;
      }),
    ).toThrow(aborted);
    const load = vi.fn(() => ({
      bytes: new Uint8Array(8),
    }));

    expect(cache.getOrLoad(key(), load).bytes).toHaveLength(8);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads a cached chunk whose backing buffer was detached", () => {
    const cache = createMcapDecompressedChunkCache();
    const first = new Uint8Array(8);
    const load = vi
      .fn<() => { bytes: Uint8Array }>()
      .mockReturnValueOnce({ bytes: first })
      .mockReturnValueOnce({ bytes: new Uint8Array(8) });
    cache.getOrLoad(key(), load);

    structuredClone(first, { transfer: [first.buffer] });

    expect(cache.getOrLoad(key(), load).bytes).toHaveLength(8);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("clears on source version changes and rejects use after teardown", () => {
    const cache = createMcapDecompressedChunkCache();
    const load = vi.fn(() => ({
      bytes: new Uint8Array(8),
    }));
    cache.getOrLoad(key(), load);
    cache.getOrLoad(key({ sourceKey: "source-a:version-2" }), load);
    cache.getOrLoad(key(), load);
    expect(load).toHaveBeenCalledTimes(3);

    cache.dispose();
    expect(() => cache.getOrLoad(key(), load)).toThrow("disposed");
  });

  it("rejects size mismatches without admitting the output", () => {
    const cache = createMcapDecompressedChunkCache();
    const invalid = vi.fn(() => ({
      bytes: new Uint8Array(7),
    }));
    expect(() => cache.getOrLoad(key(), invalid)).toThrow(
      "Expected 8 decompressed bytes",
    );
    const valid = vi.fn(() => ({
      bytes: new Uint8Array(8),
    }));
    cache.getOrLoad(key(), valid);
    expect(valid).toHaveBeenCalledOnce();
  });
});
