import { defaultDecoderRegistry } from "../decoders";
import {
  createCacheApiByteRangeCache,
  createCachedByteClient,
  createHttpByteClient,
  createMemoryByteRangeCache,
  DEFAULT_BYTE_CACHE_SIZE_BYTES,
  defaultByteCacheBlockSizeBytes,
} from "./bytes";
import {
  createDecodeClient,
  createMemoryDecodedOutputCache,
  DEFAULT_DECODED_CACHE_SIZE_BYTES,
} from "./decode";
import type {
  CreateMultimodalQueryClientOptions,
  MultimodalQueryClient,
} from "./types";

/**
 * Creates the source-agnostic query client surface.
 */
export function createMultimodalQueryClient(
  options: CreateMultimodalQueryClientOptions = {},
): MultimodalQueryClient {
  const byteCaches = {
    blockSizeBytes:
      options.caches?.bytes?.blockSizeBytes ?? defaultByteCacheBlockSizeBytes,
    debug: options.caches?.bytes?.debug,
    onRead: options.caches?.bytes?.onRead,
    memory:
      options.caches?.bytes?.memory ??
      createMemoryByteRangeCache({
        maxSizeBytes: DEFAULT_BYTE_CACHE_SIZE_BYTES,
      }),
    // Shared across workers and page loads; feature-detected, and `false`
    // opts a client out entirely.
    persistent:
      options.caches?.bytes?.persistent ?? createCacheApiByteRangeCache(),
  };
  const decodedCache =
    options.caches?.decoded ??
    createMemoryDecodedOutputCache({
      maxSizeBytes: DEFAULT_DECODED_CACHE_SIZE_BYTES,
    });
  const caches = {
    bytes: byteCaches,
    decoded: decodedCache,
  };
  const bytes =
    options.bytes ?? createCachedByteClient(createHttpByteClient(), byteCaches);
  const decode =
    options.decode ??
    createDecodeClient({
      cache: decodedCache,
      executor: options.decodeExecutor,
      registry: options.decoderRegistry ?? defaultDecoderRegistry,
    });

  return {
    bytes,
    caches,
    decode,
  };
}

/**
 * Public byte-query surface.
 */
export * from "./bytes";

/**
 * Public decode-query surface.
 */
export * from "./decode";

/**
 * Public combined query-client contracts.
 */
export type {
  CreateMultimodalQueryClientOptions,
  MultimodalQueryCaches,
  MultimodalQueryClient,
} from "./types";
