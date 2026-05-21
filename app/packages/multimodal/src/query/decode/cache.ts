import {
  createByteBoundedCache,
  estimateFieldSize,
  type MemoryCacheOptions,
  serializeCacheKey,
  setByteBoundedEntry,
} from "../cache-utils";
import { byteSourceCacheKey } from "../bytes";
import type {
  DecodedOutputCache,
  DecodedOutputCacheKey,
  DecodeResult,
} from "./types";

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
 * Creates a byte-bounded in-memory cache for decoded playback/visualization outputs.
 */
export function createMemoryDecodedOutputCache(
  options: MemoryCacheOptions
): DecodedOutputCache {
  const cache = createByteBoundedCache<DecodeResult>(options);

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
