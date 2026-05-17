import { LRUCache } from "lru-cache";

import type {
  ByteRange,
  ByteRangeCache,
  ByteRangeReadRequest,
  ByteRangeReadResult,
  ByteSourceDescriptor,
  DecodedOutputCache,
  DecodedOutputCacheKey,
  DecodeResourceResult,
} from "./types";

/**
 * Primitive value accepted by stable cache-key serialization.
 */
export type CacheKeyPart = string | null;

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
  return serializeCacheKey([
    key.decoderId,
    key.decoderVersion,
    key.decoderOptionsKey ?? null,
    payloadCacheKey(key.payload),
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

      const containingHit = cache.find((candidate) =>
        canServeRange(candidate, request)
      );
      if (!containingHit) {
        return undefined;
      }

      return sliceByteRangeResult(containingHit, request.range);
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
      setByteBoundedEntry(
        cache,
        options,
        decodedOutputCacheKey(key),
        result,
        estimateDecodeResultSize(result)
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

function canServeRange(
  candidate: ByteRangeReadResult,
  request: ByteRangeReadRequest
) {
  return (
    canServeSource(candidate.source, request.source) &&
    containsRange(candidate.range, request.range)
  );
}

function canServeSource(
  candidate: ByteSourceDescriptor,
  request: ByteSourceDescriptor
) {
  if (
    candidate.sourceId !== request.sourceId ||
    candidate.url !== request.url
  ) {
    return false;
  }

  return (
    sizeMatches(candidate, request) &&
    fingerprintFieldMatches(candidate, request, "firstChunkCrc") &&
    fingerprintFieldMatches(candidate, request, "lastChunkCrc")
  );
}

function sizeMatches(
  candidate: ByteSourceDescriptor,
  request: ByteSourceDescriptor
) {
  const candidateSize = candidate.sizeBytes ?? candidate.fingerprint?.sizeBytes;
  const requestSize = request.sizeBytes ?? request.fingerprint?.sizeBytes;

  return (
    candidateSize === undefined ||
    requestSize === undefined ||
    candidateSize === requestSize
  );
}

function fingerprintFieldMatches(
  candidate: ByteSourceDescriptor,
  request: ByteSourceDescriptor,
  field: "firstChunkCrc" | "lastChunkCrc"
) {
  const candidateValue = candidate.fingerprint?.[field];
  const requestValue = request.fingerprint?.[field];

  return (
    candidateValue === undefined ||
    requestValue === undefined ||
    candidateValue === requestValue
  );
}

function containsRange(outer: ByteRange, inner: ByteRange) {
  return (
    outer.offset <= inner.offset &&
    outer.offset + outer.length >= inner.offset + inner.length
  );
}

function sliceByteRangeResult(
  result: ByteRangeReadResult,
  range: ByteRange
): ByteRangeReadResult {
  const start = safeNumber(range.offset - result.range.offset);
  const end = start + safeNumber(range.length);

  return {
    bytes: result.bytes.subarray(start, end),
    range,
    source: result.source,
  };
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

function payloadCacheKey(payload: DecodedOutputCacheKey["payload"]): string {
  return serializeCacheKey([
    payload.encoding,
    payload.schemaEncoding ?? null,
    payload.schema ?? null,
  ]);
}

/**
 * Serializes key parts without delimiter collisions.
 */
export function serializeCacheKey(parts: readonly CacheKeyPart[]): string {
  return JSON.stringify(parts);
}

function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `Byte length ${value.toString()} exceeds safe number range`
    );
  }

  return Number(value);
}

function estimateDecodeResultSize(result: DecodeResourceResult): number {
  const hintedSize = result.output.resourceHints?.sizeBytes;
  if (hintedSize !== undefined) {
    return (
      hintedSize +
      estimateFieldSize(result.output.attributes) +
      estimateFieldSize(result.output.timing)
    );
  }

  return estimateFieldSize(result.output);
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
