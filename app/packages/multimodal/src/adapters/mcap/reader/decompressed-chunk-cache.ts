import { LRUCache } from "lru-cache";
import {
  createMcapDecompressionCacheOwnerId,
  mcapDecompressionChunkIdentity,
  recordMcapDecompressionCache,
  type McapDecompressionCacheSample,
} from "../decompression-cache-meter";

export const DEFAULT_MCAP_DECOMPRESSED_CHUNK_CACHE_BYTES = 128 * 1024 * 1024;

export interface McapDecompressedChunkKey {
  readonly compressedLength: bigint;
  readonly compressedOffset: bigint;
  readonly compression: string;
  readonly decompressedSize: bigint;
  readonly sourceKey: string;
}

export interface McapDecompressedChunkLoad {
  readonly bytes: Uint8Array;
  readonly durationMs: number;
}

export interface McapDecompressedChunkResult {
  readonly bytes: Uint8Array;
  readonly cacheHit: boolean;
}

export interface McapDecompressedChunkCache {
  /** Clears bytes if the source access/content identity changed. */
  activateSource(sourceKey: string): void;
  clear(): void;
  dispose(): void;
  get(
    key: McapDecompressedChunkKey,
    path: McapDecompressionCacheSample["path"],
  ): McapDecompressedChunkResult | undefined;
  getOrLoad(
    key: McapDecompressedChunkKey,
    path: McapDecompressionCacheSample["path"],
    load: () => McapDecompressedChunkLoad,
  ): McapDecompressedChunkResult;
  loadUnkeyed(
    input: {
      readonly chunkIdentity: string;
      readonly compressedBytes: number;
      readonly compression: string;
      readonly decompressedSize: bigint;
    },
    path: McapDecompressionCacheSample["path"],
    load: () => McapDecompressedChunkLoad,
  ): McapDecompressedChunkResult;
}

/**
 * One source-bound decompressed-record cache shared by every reader surface.
 * Cached arrays are adapter-owned: callers may read and slice them, but must
 * never transfer, detach, or mutate their backing buffers.
 */
export function createMcapDecompressedChunkCache(
  maxSizeBytes = DEFAULT_MCAP_DECOMPRESSED_CHUNK_CACHE_BYTES,
): McapDecompressedChunkCache {
  const capacityBytes = Math.max(1, Math.floor(maxSizeBytes));
  let activeSourceKey: string | undefined;
  let disposed = false;
  let evictedBytes = 0;
  let evictions = 0;
  const cacheOwnerId = createMcapDecompressionCacheOwnerId("shared-reader");
  const cache = new LRUCache<string, Uint8Array>({
    dispose: (value, _key, reason) => {
      if (reason === "evict") {
        evictedBytes += value.byteLength;
        evictions += 1;
      }
    },
    maxSize: capacityBytes,
    sizeCalculation: (value) => Math.max(1, value.byteLength),
  });

  const activateSource = (sourceKey: string) => {
    assertActive();
    if (activeSourceKey !== sourceKey) {
      cache.clear();
      activeSourceKey = sourceKey;
    }
  };
  const assertActive = () => {
    if (disposed) {
      throw new Error("MCAP decompressed chunk cache is disposed");
    }
  };
  const recordAccess = ({
    bytes,
    cacheHit,
    durationMs,
    evictedBytesBefore,
    evictionsBefore,
    key,
    path,
  }: {
    readonly bytes: Uint8Array;
    readonly cacheHit: boolean;
    readonly durationMs: number;
    readonly evictedBytesBefore: number;
    readonly evictionsBefore: number;
    readonly key: McapDecompressedChunkKey;
    readonly path: McapDecompressionCacheSample["path"];
  }) => {
    recordMcapDecompressionCache({
      cacheCapacityBytes: capacityBytes,
      cacheEvictedBytes: evictedBytes - evictedBytesBefore,
      cacheEvictions: evictions - evictionsBefore,
      cacheHit,
      cacheOwnerId,
      cacheResidentBytes: cache.calculatedSize ?? 0,
      chunkIdentity: mcapDecompressionChunkIdentity({
        chunkLength: key.compressedLength,
        chunkStartOffset: key.compressedOffset,
        compression: key.compression,
        sourceKey: key.sourceKey,
        uncompressedSize: key.decompressedSize,
      }),
      chunkIdentityStable: true,
      compressedBytes: safeBigIntToNumber(key.compressedLength),
      compression: key.compression,
      decompressedBytes: bytes.byteLength,
      durationMs,
      path,
    });
  };
  const readCached = (serializedKey: string) => {
    const cached = cache.get(serializedKey);
    if (cached && cached.buffer.byteLength !== 0) {
      return cached;
    }
    if (cached) {
      cache.delete(serializedKey);
    }
    return undefined;
  };

  return {
    activateSource,

    clear() {
      assertActive();
      cache.clear();
      activeSourceKey = undefined;
    },

    dispose() {
      if (disposed) return;
      cache.clear();
      activeSourceKey = undefined;
      disposed = true;
    },

    get(key, path) {
      assertActive();
      activateSource(key.sourceKey);
      const evictedBytesBefore = evictedBytes;
      const evictionsBefore = evictions;
      const cached = readCached(serializeMcapDecompressedChunkKey(key));
      if (!cached) return undefined;
      recordAccess({
        bytes: cached,
        cacheHit: true,
        durationMs: 0,
        evictedBytesBefore,
        evictionsBefore,
        key,
        path,
      });
      return { bytes: cached, cacheHit: true };
    },

    getOrLoad(key, path, load) {
      assertActive();
      activateSource(key.sourceKey);
      const serializedKey = serializeMcapDecompressedChunkKey(key);
      const evictedBytesBefore = evictedBytes;
      const evictionsBefore = evictions;
      const cached = readCached(serializedKey);
      if (cached) {
        recordAccess({
          bytes: cached,
          cacheHit: true,
          durationMs: 0,
          evictedBytesBefore,
          evictionsBefore,
          key,
          path,
        });
        return { bytes: cached, cacheHit: true };
      }
      const loaded = load();
      if (BigInt(loaded.bytes.byteLength) !== key.decompressedSize) {
        throw new Error(
          `Expected ${key.decompressedSize.toString()} decompressed bytes but received ${loaded.bytes.byteLength}`,
        );
      }
      if (loaded.bytes.buffer.byteLength === 0) {
        throw new Error("Cannot cache a detached decompressed MCAP chunk");
      }
      if (loaded.bytes.byteLength <= capacityBytes) {
        cache.set(serializedKey, loaded.bytes);
      }
      recordAccess({
        bytes: loaded.bytes,
        cacheHit: false,
        durationMs: loaded.durationMs,
        evictedBytesBefore,
        evictionsBefore,
        key,
        path,
      });
      return { bytes: loaded.bytes, cacheHit: false };
    },

    loadUnkeyed(input, path, load) {
      assertActive();
      const loaded = load();
      if (BigInt(loaded.bytes.byteLength) !== input.decompressedSize) {
        throw new Error(
          `Expected ${input.decompressedSize.toString()} decompressed bytes but received ${loaded.bytes.byteLength}`,
        );
      }
      if (loaded.bytes.buffer.byteLength === 0) {
        throw new Error("Cannot return a detached decompressed MCAP chunk");
      }
      recordMcapDecompressionCache({
        cacheCapacityBytes: capacityBytes,
        cacheEvictedBytes: 0,
        cacheEvictions: 0,
        cacheHit: false,
        cacheOwnerId,
        cacheResidentBytes: cache.calculatedSize ?? 0,
        chunkIdentity: input.chunkIdentity,
        chunkIdentityStable: false,
        compressedBytes: input.compressedBytes,
        compression: input.compression,
        decompressedBytes: loaded.bytes.byteLength,
        durationMs: loaded.durationMs,
        path,
      });
      return { bytes: loaded.bytes, cacheHit: false };
    },
  };
}

export function serializeMcapDecompressedChunkKey(
  key: McapDecompressedChunkKey,
): string {
  return JSON.stringify([
    key.sourceKey,
    key.compressedOffset.toString(),
    key.compressedLength.toString(),
    key.compression,
    key.decompressedSize.toString(),
  ]);
}

function safeBigIntToNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(
      "MCAP compressed chunk bytes exceed the safe integer range",
    );
  }
  return number;
}
