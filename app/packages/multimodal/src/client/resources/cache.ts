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
 * Options for bounded in-memory caches.
 */
export interface MemoryCacheOptions {
  readonly maxSizeBytes: number;
}

/**
 * Creates a stable cache key for a byte-range read.
 */
export function byteRangeCacheKey(request: ByteRangeReadRequest): string {
  return [
    sourceCacheKey(request.source),
    request.range.offset.toString(),
    request.range.length.toString(),
  ].join("|");
}

/**
 * Creates a stable cache key for a decoded output.
 */
export function decodedOutputCacheKey(key: DecodedOutputCacheKey): string {
  return [
    key.decoderId,
    key.decoderVersion,
    key.decoderOptionsKey ?? "",
    payloadCacheKey(key.payload),
    key.streamId,
    key.recordId,
    key.timeNs?.toString() ?? "",
    key.source ? sourceCacheKey(key.source) : "",
  ].join("|");
}

/**
 * Creates a byte-bounded in-memory cache for raw byte ranges.
 */
export function createMemoryByteRangeCache(
  options: MemoryCacheOptions
): ByteRangeCache {
  const cache = new BoundedMemoryCache<ByteRangeReadResult>(
    options.maxSizeBytes
  );

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
      cache.set(byteRangeCacheKey(result), result, result.bytes.byteLength);
    },
  };
}

/**
 * Creates a byte-bounded in-memory cache for decoded archetype outputs.
 */
export function createMemoryDecodedOutputCache(
  options: MemoryCacheOptions
): DecodedOutputCache {
  const cache = new BoundedMemoryCache<DecodeResourceResult>(
    options.maxSizeBytes
  );

  return {
    async clear() {
      cache.clear();
    },
    async get(key) {
      return cache.get(decodedOutputCacheKey(key));
    },
    async put(key, result) {
      cache.set(
        decodedOutputCacheKey(key),
        result,
        estimateDecodeResultSize(result)
      );
    },
  };
}

class BoundedMemoryCache<Value> {
  private readonly entries = new Map<
    string,
    { readonly sizeBytes: number; readonly value: Value }
  >();
  private totalSizeBytes = 0;

  constructor(private readonly maxSizeBytes: number) {}

  clear() {
    this.entries.clear();
    this.totalSizeBytes = 0;
  }

  get(key: string): Value | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);

    return entry.value;
  }

  find(predicate: (value: Value) => boolean): Value | undefined {
    for (const [key, entry] of this.entries) {
      if (predicate(entry.value)) {
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry.value;
      }
    }

    return undefined;
  }

  set(key: string, value: Value, sizeBytes: number) {
    if (sizeBytes > this.maxSizeBytes) {
      return;
    }

    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.totalSizeBytes -= existing.sizeBytes;
    }

    this.entries.set(key, { sizeBytes, value });
    this.totalSizeBytes += sizeBytes;
    this.evictOverflow();
  }

  private evictOverflow() {
    while (this.totalSizeBytes > this.maxSizeBytes) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }

      const oldestEntry = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      this.totalSizeBytes -= oldestEntry?.sizeBytes ?? 0;
    }
  }
}

function canServeRange(
  candidate: ByteRangeReadResult,
  request: ByteRangeReadRequest
) {
  return (
    sourceCacheKey(candidate.source) === sourceCacheKey(request.source) &&
    containsRange(candidate.range, request.range)
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

function sourceCacheKey(source: ByteSourceDescriptor): string {
  const fingerprint = source.fingerprint;

  return [
    source.sourceId,
    source.url,
    source.sizeBytes ?? fingerprint?.sizeBytes ?? "",
    fingerprint?.firstChunkCrc?.toString() ?? "",
    fingerprint?.lastChunkCrc?.toString() ?? "",
  ].join(":");
}

function payloadCacheKey(payload: DecodedOutputCacheKey["payload"]): string {
  return JSON.stringify([
    payload.encoding,
    payload.schemaEncoding ?? null,
    payload.schema ?? null,
  ]);
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
  return (
    byteLength(result.output.render.data) +
    estimateFieldSize(result.output.fields) +
    estimateFieldSize(result.output.render.metadata)
  );
}

function byteLength(value: Uint8Array | Float32Array | ArrayBuffer): number {
  return value instanceof ArrayBuffer ? value.byteLength : value.byteLength;
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
    return value.length;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return 8;
  }
  if (typeof value === "boolean") {
    return 1;
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

  return 1;
}
