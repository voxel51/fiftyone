import { LRUCache } from "lru-cache";
import type { McapTypes } from "@mcap/core";
import {
  isMcapDecodeStageMeterEnabled,
  mcapDecodeStageNowMs,
  recordMcapDecodeStage,
} from "../decode-stage-meter";
import {
  createMcapDecompressionCacheOwnerId,
  isMcapDecompressionCacheMeterEnabled,
  mcapDecompressionBufferIdentity,
  mcapDecompressionChunkIdentity,
  recordMcapDecompressionCache,
} from "../decompression-cache-meter";
import type {
  McapDecompressedChunkCache,
  McapDecompressedChunkKey,
} from "./decompressed-chunk-cache";

const DEFAULT_DECOMPRESSED_CHUNK_CACHE_SIZE_BYTES = 64 * 1024 * 1024;

export interface CachedMcapDecompressHandlersOptions {
  readonly cache?: McapDecompressedChunkCache;
  readonly resolveChunkIdentity?: (buffer: Uint8Array) =>
    | {
        readonly chunkLength: bigint;
        readonly chunkStartOffset: bigint;
        readonly compression: string;
        readonly sourceKey: string;
        readonly uncompressedSize: bigint;
      }
    | undefined;
  readonly resolveSourceRange?: (buffer: Uint8Array) =>
    | {
        readonly length: bigint;
        readonly offset: bigint;
        readonly sourceKey: string;
      }
    | undefined;
}

export function createCachedMcapDecompressHandlers(
  handlers: McapTypes.DecompressHandlers,
  maxSizeBytes = DEFAULT_DECOMPRESSED_CHUNK_CACHE_SIZE_BYTES,
  options: CachedMcapDecompressHandlersOptions = {},
): McapTypes.DecompressHandlers {
  const capacityBytes = Math.max(1, maxSizeBytes);
  let evictedBytes = 0;
  let evictions = 0;
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
  const bufferIds = new WeakMap<ArrayBufferLike, number>();
  let nextBufferId = 0;
  const cacheOwnerId = createMcapDecompressionCacheOwnerId(
    "main-indexed-reader",
  );

  const entries = Object.entries(handlers) as Array<
    [string, McapTypes.DecompressHandlers[string]]
  >;

  return Object.fromEntries(
    entries.map(([compression, decompress]) => [
      compression,
      (buffer: Uint8Array, decompressedSize: bigint) => {
        const sourceRange = options.resolveSourceRange?.(buffer);
        if (options.cache && sourceRange) {
          const sharedKey: McapDecompressedChunkKey = {
            compressedLength: sourceRange.length,
            compressedOffset: sourceRange.offset,
            compression,
            decompressedSize,
            sourceKey: sourceRange.sourceKey,
          };
          return options.cache.getOrLoad(sharedKey, "main-indexed-reader", () =>
            meteredDecompress(
              decompress,
              compression,
              buffer,
              decompressedSize,
            ),
          ).bytes;
        }
        const key = decompressCacheKey({
          buffer,
          bufferIds,
          compression,
          decompressedSize,
          nextBufferId: () => ++nextBufferId,
        });
        if (options.cache) {
          return options.cache.loadUnkeyed(
            {
              chunkIdentity: mcapDecompressionBufferIdentity(key),
              compressedBytes: buffer.byteLength,
              compression,
              decompressedSize,
            },
            "main-indexed-reader",
            () =>
              meteredDecompress(
                decompress,
                compression,
                buffer,
                decompressedSize,
              ),
          ).bytes;
        }
        const resolvedIdentity = options.resolveChunkIdentity?.(buffer);
        const chunkIdentity = resolvedIdentity
          ? mcapDecompressionChunkIdentity(resolvedIdentity)
          : mcapDecompressionBufferIdentity(key);
        const evictionsBefore = evictions;
        const evictedBytesBefore = evictedBytes;
        const cached = cache.get(key);
        if (cached) {
          recordMcapDecompressionCache({
            cacheCapacityBytes: capacityBytes,
            cacheEvictedBytes: evictedBytes - evictedBytesBefore,
            cacheEvictions: evictions - evictionsBefore,
            cacheHit: true,
            cacheOwnerId,
            cacheResidentBytes: cache.calculatedSize ?? 0,
            chunkIdentity,
            chunkIdentityStable: resolvedIdentity !== undefined,
            compressedBytes: buffer.byteLength,
            compression,
            decompressedBytes: cached.byteLength,
            durationMs: 0,
            path: "main-indexed-reader",
          });
          return cached;
        }

        const { bytes: decompressed, durationMs } = meteredDecompress(
          decompress,
          compression,
          buffer,
          decompressedSize,
        );
        cache.set(key, decompressed);
        recordMcapDecompressionCache({
          cacheCapacityBytes: capacityBytes,
          cacheEvictedBytes: evictedBytes - evictedBytesBefore,
          cacheEvictions: evictions - evictionsBefore,
          cacheHit: false,
          cacheOwnerId,
          cacheResidentBytes: cache.calculatedSize ?? 0,
          chunkIdentity,
          chunkIdentityStable: resolvedIdentity !== undefined,
          compressedBytes: buffer.byteLength,
          compression,
          decompressedBytes: decompressed.byteLength,
          durationMs,
          path: "main-indexed-reader",
        });
        return decompressed;
      },
    ]),
  );
}

function meteredDecompress(
  decompress: McapTypes.DecompressHandlers[string],
  compression: string,
  buffer: Uint8Array,
  decompressedSize: bigint,
): { readonly bytes: Uint8Array; readonly durationMs: number } {
  if (
    !isMcapDecodeStageMeterEnabled() &&
    !isMcapDecompressionCacheMeterEnabled()
  ) {
    return {
      bytes: decompress(buffer, decompressedSize),
      durationMs: 0,
    };
  }

  const startMs = mcapDecodeStageNowMs();
  const decompressed = decompress(buffer, decompressedSize);
  const durationMs = mcapDecodeStageNowMs() - startMs;
  if (isMcapDecodeStageMeterEnabled()) {
    recordMcapDecodeStage({
      bytes: decompressed.byteLength,
      label: compression || "none",
      ms: durationMs,
      stage: "decompress",
    });
  }
  return { bytes: decompressed, durationMs };
}

function decompressCacheKey({
  buffer,
  bufferIds,
  compression,
  decompressedSize,
  nextBufferId,
}: {
  readonly buffer: Uint8Array;
  readonly bufferIds: WeakMap<ArrayBufferLike, number>;
  readonly compression: string;
  readonly decompressedSize: bigint;
  readonly nextBufferId: () => number;
}): string {
  let bufferId = bufferIds.get(buffer.buffer);
  if (bufferId === undefined) {
    bufferId = nextBufferId();
    bufferIds.set(buffer.buffer, bufferId);
  }

  return [
    compression,
    bufferId,
    buffer.byteOffset,
    buffer.byteLength,
    decompressedSize.toString(),
  ].join(":");
}

