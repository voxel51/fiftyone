import { LRUCache } from "lru-cache";

const DEFAULT_MCAP_DECOMPRESSED_CHUNK_CACHE_BYTES = 128 * 1024 * 1024;

export interface McapDecompressedChunkKey {
  readonly compressedLength: bigint;
  readonly compressedOffset: bigint;
  readonly compression: string;
  readonly decompressedSize: bigint;
  readonly sourceKey: string;
}

export interface McapDecompressedChunkLoad {
  readonly bytes: Uint8Array;
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
  get(key: McapDecompressedChunkKey): McapDecompressedChunkResult | undefined;
  getOrLoad(
    key: McapDecompressedChunkKey,
    load: () => McapDecompressedChunkLoad,
  ): McapDecompressedChunkResult;
  loadUnkeyed(
    input: {
      readonly decompressedSize: bigint;
    },
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
  const cache = new LRUCache<string, Uint8Array>({
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

    get(key) {
      assertActive();
      activateSource(key.sourceKey);
      const cached = readCached(serializeMcapDecompressedChunkKey(key));
      if (!cached) return undefined;
      return { bytes: cached, cacheHit: true };
    },

    getOrLoad(key, load) {
      assertActive();
      activateSource(key.sourceKey);
      const serializedKey = serializeMcapDecompressedChunkKey(key);
      const cached = readCached(serializedKey);
      if (cached) {
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
      return { bytes: loaded.bytes, cacheHit: false };
    },

    loadUnkeyed(input, load) {
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
