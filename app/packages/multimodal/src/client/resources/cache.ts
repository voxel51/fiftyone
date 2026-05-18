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
          candidate.source.sourceId === request.source.sourceId &&
          candidate.source.url === request.source.url;
        if (!sourceMatches) {
          return false;
        }

        const candidateSize =
          candidate.source.sizeBytes ?? candidate.source.fingerprint?.sizeBytes;
        const requestSize =
          request.source.sizeBytes ?? request.source.fingerprint?.sizeBytes;
        const sizeMatches =
          candidateSize === undefined ||
          requestSize === undefined ||
          candidateSize === requestSize;

        const candidateFirstChunkCrc =
          candidate.source.fingerprint?.firstChunkCrc;
        const requestFirstChunkCrc = request.source.fingerprint?.firstChunkCrc;
        const firstChunkCrcMatches =
          candidateFirstChunkCrc === undefined ||
          requestFirstChunkCrc === undefined ||
          candidateFirstChunkCrc === requestFirstChunkCrc;

        const candidateLastChunkCrc =
          candidate.source.fingerprint?.lastChunkCrc;
        const requestLastChunkCrc = request.source.fingerprint?.lastChunkCrc;
        const lastChunkCrcMatches =
          candidateLastChunkCrc === undefined ||
          requestLastChunkCrc === undefined ||
          candidateLastChunkCrc === requestLastChunkCrc;

        const rangeContainsRequest =
          candidate.range.offset <= request.range.offset &&
          candidate.range.offset + candidate.range.length >=
            request.range.offset + request.range.length;

        return (
          sizeMatches &&
          firstChunkCrcMatches &&
          lastChunkCrcMatches &&
          rangeContainsRequest
        );
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
  return new LRUCache<string, Value>({
    maxSize: Math.max(MIN_CACHE_SIZE_BYTES, options.maxSizeBytes),
  });
}

function setByteBoundedEntry<Value extends object>(
  cache: LRUCache<string, Value>,
  options: MemoryCacheOptions,
  key: string,
  value: Value,
  sizeBytes: number
) {
  if (sizeBytes > options.maxSizeBytes) {
    return;
  }

  cache.set(key, value, {
    size: Math.max(MIN_CACHE_ENTRY_SIZE_BYTES, sizeBytes),
  });
}

/**
 * Creates a stable key for byte-source identity.
 */
export function byteSourceCacheKey(source: ByteSourceDescriptor): string {
  const fingerprint = source.fingerprint;

  return serializeCacheKey([
    source.sourceId,
    source.url,
    source.sizeBytes ?? fingerprint?.sizeBytes ?? null,
    fingerprint?.firstChunkCrc?.toString() ?? null,
    fingerprint?.lastChunkCrc?.toString() ?? null,
  ]);
}

/**
 * Serializes key parts without delimiter collisions.
 */
export function serializeCacheKey(parts: readonly (string | null)[]): string {
  return JSON.stringify(parts);
}

function estimateFieldSize(value: unknown): number {
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
  if (Array.isArray(value)) {
    return value.reduce((size, item) => size + estimateFieldSize(item), 0);
  }
  if (typeof value === "object") {
    return Object.values(value).reduce(
      (size, item) => size + estimateFieldSize(item),
      0
    );
  }

  return ESTIMATED_UNKNOWN_FIELD_SIZE_BYTES;
}
