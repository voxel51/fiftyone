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
    let size = 0;
    for (const item of value) size += estimateFieldSize(item, visited);
    return size;
  }
  if (isUnknownRecord(value)) {
    let size = 0;
    for (const item of Object.values(value)) {
      size += estimateFieldSize(item, visited);
    }
    return size;
  }

  return ESTIMATED_UNKNOWN_FIELD_SIZE_BYTES;
}

function measuredBackingStoreBytes(
  value: unknown,
  visited = new WeakSet<object>(),
): number {
  if (value === undefined || value === null) return 0;
  if (value instanceof ArrayBuffer) {
    if (visited.has(value)) return 0;
    visited.add(value);
    return value.byteLength;
  }
  if (ArrayBuffer.isView(value)) {
    if (visited.has(value.buffer)) return 0;
    visited.add(value.buffer);
    return value.byteLength;
  }
  if (typeof value !== "object" || visited.has(value)) return 0;
  visited.add(value);
  return Object.values(value).reduce(
    (size, item) => size + measuredBackingStoreBytes(item, visited),
    0,
  );
}

/** Estimates one decoded output for every cache and retention byte ledger. */
export function decodedOutputSizeBytes(output: DecodedOutput): number {
  const hintedBytes = output.resourceHints?.sizeBytes;
  const bytes =
    hintedBytes === undefined
      ? estimateFieldSize(output)
      : Number.isSafeInteger(hintedBytes) && hintedBytes >= 0
        ? Math.min(
            Number.MAX_SAFE_INTEGER,
            hintedBytes +
              estimateFieldSize(output.attributes) +
              estimateFieldSize(output.timing),
          )
        : measuredBackingStoreBytes(output);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : 0;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
