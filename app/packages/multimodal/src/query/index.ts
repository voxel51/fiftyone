import { defaultDecoderRegistry } from "../decoders";
import {
  createAdaptiveByteCacheBlockSize,
  createCacheApiByteRangeCache,
  createCachedByteClient,
  createHttpByteClient,
  createMemoryByteRangeCache,
  DEFAULT_BYTE_CACHE_SIZE_BYTES,
} from "./bytes";
import type { ByteReadDebugLog } from "./bytes";
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
  // Explicit block-size overrides own their policy; otherwise measured
  // small-fetch latency can promote scheme-misclassified sources (a "local"
  // path served over a WAN) to the remote fill size.
  const adaptiveBlockSize = options.caches?.bytes?.blockSizeBytes
    ? null
    : createAdaptiveByteCacheBlockSize();
  const byteCaches = {
    blockSizeBytes:
      options.caches?.bytes?.blockSizeBytes ??
      adaptiveBlockSize?.blockSizeBytes,
    debug: options.caches?.bytes?.debug,
    onRead: chainByteReadObservers(
      adaptiveBlockSize?.onRead,
      options.caches?.bytes?.onRead,
    ),
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

function chainByteReadObservers(
  ...observers: readonly (((entry: ByteReadDebugLog) => void) | undefined)[]
): ((entry: ByteReadDebugLog) => void) | undefined {
  const active = observers.filter(
    (observer): observer is (entry: ByteReadDebugLog) => void =>
      typeof observer === "function",
  );
  if (active.length === 0) {
    return undefined;
  }
  if (active.length === 1) {
    return active[0];
  }

  return (entry) => {
    for (const observer of active) {
      observer(entry);
    }
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
