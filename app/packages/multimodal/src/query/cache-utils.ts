import { LRUCache } from "lru-cache";
import type { DecodedOutput } from "../ir";

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
 * Creates an LRU cache sized by normalized byte capacity.
 */
export function createByteBoundedCache<Value extends object>(
  options: MemoryCacheOptions,
) {
  const maxSizeBytes = normalizeCacheSizeBytes(
    options.maxSizeBytes,
    MIN_CACHE_SIZE_BYTES,
  );

  return new LRUCache<string, Value>({
    maxSize: maxSizeBytes,
  });
}

/**
 * Stores an entry only when its byte estimate fits the cache budget.
 */
export function setByteBoundedEntry<Value extends object>(
  cache: LRUCache<string, Value>,
  options: MemoryCacheOptions,
  key: string,
  value: Value,
  sizeBytes: number,
) {
  const maxSizeBytes = normalizeCacheSizeBytes(
    options.maxSizeBytes,
    MIN_CACHE_SIZE_BYTES,
  );
  const entrySizeBytes = normalizeCacheSizeBytes(
    sizeBytes,
    MIN_CACHE_ENTRY_SIZE_BYTES,
  );

  if (entrySizeBytes > maxSizeBytes) {
    return;
  }

  cache.set(key, value, {
    size: entrySizeBytes,
  });
}

/**
 * Serializes key parts without delimiter collisions.
 */
export function serializeCacheKey(parts: readonly (string | null)[]): string {
  return JSON.stringify(parts);
}

/**
 * Estimates nested decoded payload size for cache eviction.
 */
function estimateFieldSize(
  value: unknown,
  visited = new WeakSet<object>(),
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
      0,
    );
  }
  if (typeof value === "object") {
    return Object.values(value).reduce(
      (size, item) => size + estimateFieldSize(item, visited),
      0,
    );
  }

  return ESTIMATED_UNKNOWN_FIELD_SIZE_BYTES;
}

/** Estimates one decoded output for every cache and retention byte ledger. */
export function decodedOutputSizeBytes(output: DecodedOutput): number {
  const hint = output.resourceHints?.sizeBytes;
  const hintedBytes =
    typeof hint === "number" && Number.isSafeInteger(hint) && hint >= 0
      ? hint
      : undefined;
  // A decoder hint is not a retained-size contract. Count each underlying
  // binary store once even when visualization data and transfer hints expose
  // the same buffer through multiple views.
  const binaryBytes = estimateUniqueBinaryBytes(output);
  const payloadBytes = Math.max(hintedBytes ?? 0, binaryBytes);
  const auxiliaryBytes =
    estimateFieldSize(output.attributes) + estimateFieldSize(output.timing);
  const bytes =
    hint === undefined
      ? estimateFieldSize(output)
      : hintedBytes === undefined
        ? binaryBytes
        : payloadBytes > 0
          ? payloadBytes + auxiliaryBytes
          : 0;
  if (Number.isNaN(bytes) || bytes <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(bytes));
}

function estimateUniqueBinaryBytes(value: unknown): number {
  const buffers = new Set<ArrayBufferLike>();
  const visited = new WeakSet<object>();
  const visit = (candidate: unknown): number => {
    if (candidate instanceof ArrayBuffer) {
      if (buffers.has(candidate)) return 0;
      buffers.add(candidate);
      return candidate.byteLength;
    }
    if (ArrayBuffer.isView(candidate)) {
      const buffer = candidate.buffer;
      if (buffers.has(buffer)) return 0;
      buffers.add(buffer);
      return buffer.byteLength;
    }
    if (!candidate || typeof candidate !== "object") return 0;
    if (visited.has(candidate)) return 0;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      return candidate.reduce((bytes, item) => bytes + visit(item), 0);
    }
    return Object.values(candidate).reduce(
      (bytes, item) => bytes + visit(item),
      0,
    );
  };
  return visit(value);
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
