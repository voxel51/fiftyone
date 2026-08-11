import {
  createByteBoundedCache,
  decodedOutputSizeBytes,
  type MemoryCacheOptions,
  serializeCacheKey,
  setByteBoundedEntry,
} from "../cache-utils";
import { byteSourceCacheKey } from "../bytes";
import { payloadDescriptorKey } from "../../decoders/registry";
import type {
  DecodedOutputCache,
  DecodedOutputCacheKey,
  DecodeResult,
} from "./types";

/**
 * Creates a stable cache key for a decoded output.
 */
export function decodedOutputCacheKey(key: DecodedOutputCacheKey): string {
  return serializeCacheKey([
    key.decoderId,
    key.decoderVersion,
    key.decoderOptionsKey ?? null,
    payloadDescriptorKey(key.payload),
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
  options: MemoryCacheOptions,
): DecodedOutputCache {
  const cache = createByteBoundedCache<DecodeResult>(options);

  return {
    clear: () => Promise.resolve().then(() => cache.clear()),
    get: (key) =>
      Promise.resolve().then(() => cache.get(decodedOutputCacheKey(key))),
    put: (key, result) =>
      Promise.resolve().then(() =>
        setByteBoundedEntry(
          cache,
          options,
          decodedOutputCacheKey(key),
          result,
          decodedOutputSizeBytes(result.output),
        ),
      ),
  };
}
