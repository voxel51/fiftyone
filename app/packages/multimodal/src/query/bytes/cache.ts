import {
  createByteBoundedCache,
  type MemoryCacheOptions,
  serializeCacheKey,
  setByteBoundedEntry,
} from "../cache-utils";
import type {
  ByteRangeCache,
  ByteRangeReadRequest,
  ByteRangeReadResult,
  ByteSourceDescriptor,
} from "./types";

/**
 * Creates a stable cache key for a byte-range read.
 */
export function byteRangeCacheKey(request: ByteRangeReadRequest): string {
  return serializeCacheKey([
    byteSourceCacheKey(request.source),
    request.range.offset.toString(),
    request.range.length.toString(),
  ]);
}

/**
 * Creates a byte-bounded in-memory cache for raw byte ranges.
 */
export function createMemoryByteRangeCache(
  options: MemoryCacheOptions
): ByteRangeCache {
  const cache = createByteBoundedCache<ByteRangeReadResult>(options);

  return {
    async clear() {
      cache.clear();
    },
    async get(request) {
      const exactHit = cache.get(byteRangeCacheKey(request));
      if (exactHit) {
        return exactHit;
      }

      // The cached byte client checks normalized fill-block keys first. This
      // fallback keeps direct cache users and custom fill policies reusable.
      const containingHit = cache.find((candidate) => {
        const sourceMatches =
          byteSourceCacheKey(candidate.source) ===
          byteSourceCacheKey(request.source);
        if (!sourceMatches) {
          return false;
        }

        const rangeContainsRequest =
          candidate.range.offset <= request.range.offset &&
          candidate.range.offset + candidate.range.length >=
            request.range.offset + request.range.length;

        return rangeContainsRequest;
      });
      if (!containingHit) {
        return undefined;
      }

      const sliceStartOffset =
        request.range.offset - containingHit.range.offset;
      const maxSafeNumber = BigInt(Number.MAX_SAFE_INTEGER);
      if (sliceStartOffset > maxSafeNumber) {
        throw new Error(
          `Byte length ${sliceStartOffset.toString()} exceeds safe number range`
        );
      }
      if (request.range.length > maxSafeNumber) {
        throw new Error(
          `Byte length ${request.range.length.toString()} exceeds safe number range`
        );
      }

      const start = Number(sliceStartOffset);
      const end = start + Number(request.range.length);

      return {
        bytes: containingHit.bytes.subarray(start, end),
        range: request.range,
        source: containingHit.source,
      };
    },
    async put(result) {
      setByteBoundedEntry(
        cache,
        options,
        byteRangeCacheKey(result),
        result,
        result.bytes.byteLength
      );
    },
  };
}

/**
 * Creates a stable key for source content identity.
 */
export function byteSourceCacheKey(source: ByteSourceDescriptor): string {
  // Source size can be discovered after the first read, and fetch URLs can
  // rotate without changing bytes. Keep durable caches tied only to content.
  return serializeCacheKey([source.sourceId]);
}

/**
 * Creates a stable key for the current byte access path.
 */
export function byteSourceAccessKey(source: ByteSourceDescriptor): string {
  // Readers/workers own transport state, so they must refresh when the URL or
  // read profile changes even though the underlying sourceId stays stable.
  return serializeCacheKey([
    source.sourceId,
    source.url,
    source.readProfile ?? null,
  ]);
}

export type { MemoryCacheOptions };
