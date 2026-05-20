import { LRUCache } from "lru-cache";

import type {
  ByteRangeCache,
  ByteRangeReadRequest,
  ByteRangeReadResult,
  ByteSourceDescriptor,
  DecodedOutputCache,
  DecodedOutputCacheKey,
  DecodeResourceResult,
} from "./types";

/**
 * Options for bounded in-memory caches.
 */
export interface MemoryCacheOptions {
  readonly maxSizeBytes: number;
}

const ESTIMATED_BOOLEAN_FIELD_SIZE_BYTES = 1;
const ESTIMATED_NUMBER_FIELD_SIZE_BYTES = 8;
const ESTIMATED_UNKNOWN_FIELD_SIZE_BYTES = 1;
const MIN_CACHE_SIZE_BYTES = 1;
const MIN_CACHE_ENTRY_SIZE_BYTES = 1;

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
 * Creates a stable cache key for a decoded output.
 */
export function decodedOutputCacheKey(key: DecodedOutputCacheKey): string {
  const payloadKey = serializeCacheKey([
    key.payload.encoding,
    key.payload.schemaEncoding ?? null,
    key.payload.schema ?? null,
  ]);

  return serializeCacheKey([
    key.decoderId,
    key.decoderVersion,
    key.decoderOptionsKey ?? null,
    payloadKey,
    key.streamId,
    key.recordId,
    key.timeNs?.toString() ?? null,
    key.source ? byteSourceCacheKey(key.source) : null,
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
 * Creates a byte-bounded in-memory cache for decoded playback/visualization outputs.
 */
export function createMemoryDecodedOutputCache(
  options: MemoryCacheOptions
): DecodedOutputCache {
  const cache = createByteBoundedCache<DecodeResourceResult>(options);

  return {
    async clear() {
      cache.clear();
    },
    async get(key) {
      return cache.get(decodedOutputCacheKey(key));
    },
    async put(key, result) {
      const hintedSize = result.output.resourceHints?.sizeBytes;
      const resultSizeBytes =
        hintedSize === undefined
          ? estimateFieldSize(result.output)
          : hintedSize +
            estimateFieldSize(result.output.attributes) +
            estimateFieldSize(result.output.timing);

      setByteBoundedEntry(
        cache,
        options,
        decodedOutputCacheKey(key),
        result,
        resultSizeBytes
      );
    },
  };
}

function createByteBoundedCache<Value extends object>(
  options: MemoryCacheOptions
) {
  const maxSizeBytes = normalizeCacheSizeBytes(
    options.maxSizeBytes,
    MIN_CACHE_SIZE_BYTES
  );

  return new LRUCache<string, Value>({
    maxSize: maxSizeBytes,
  });
}

function setByteBoundedEntry<Value extends object>(
  cache: LRUCache<string, Value>,
  options: MemoryCacheOptions,
  key: string,
  value: Value,
  sizeBytes: number
) {
  const maxSizeBytes = normalizeCacheSizeBytes(
    options.maxSizeBytes,
    MIN_CACHE_SIZE_BYTES
  );
  const entrySizeBytes = normalizeCacheSizeBytes(
    sizeBytes,
    MIN_CACHE_ENTRY_SIZE_BYTES
  );

  if (entrySizeBytes > maxSizeBytes) {
    return;
  }

  cache.set(key, value, {
    size: entrySizeBytes,
  });
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

/**
 * Serializes key parts without delimiter collisions.
 */
export function serializeCacheKey(parts: readonly (string | null)[]): string {
  return JSON.stringify(parts);
}

function normalizeCacheSizeBytes(value: number, minimum: number): number {
  const sizeBytes = Number(value);
  // lru-cache expects finite integer sizes. Keep invalid caller input from
  // leaking NaN/Infinity/fractions into eviction and admission decisions.
  if (!Number.isFinite(sizeBytes) || sizeBytes < minimum) {
    return minimum;
  }

  return Math.floor(sizeBytes);
}

function estimateFieldSize(
  value: unknown,
  visited = new WeakSet<object>()
): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  if (ArrayBuffer.isView(value)) {
    return value.byteLength;
  }
  if (typeof value === "string") {
    // Cache sizing is an eviction heuristic, not exact encoded-byte accounting.
    return value.length;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return ESTIMATED_NUMBER_FIELD_SIZE_BYTES;
  }
  if (typeof value === "boolean") {
    return ESTIMATED_BOOLEAN_FIELD_SIZE_BYTES;
  }
  if (typeof value === "object") {
    // Decoder outputs can contain arbitrary nested metadata. Treat repeated
    // object references as already counted so circular shapes cannot recurse.
    if (visited.has(value)) {
      return 0;
    }

    visited.add(value);
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (size, item) => size + estimateFieldSize(item, visited),
      0
    );
  }
  if (typeof value === "object") {
    return Object.values(value).reduce(
      (size, item) => size + estimateFieldSize(item, visited),
      0
    );
  }

  return ESTIMATED_UNKNOWN_FIELD_SIZE_BYTES;
}
