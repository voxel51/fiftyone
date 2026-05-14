import { defaultDecoderRegistry } from "../../decoders";
import {
  createCachedByteResourceClient,
  createDecodeResourceClient,
  createHttpByteResourceClient,
  defaultByteCacheBlockSizeBytes,
} from "./clients";
import {
  createMemoryByteRangeCache,
  createMemoryDecodedOutputCache,
} from "./cache";
import {
  DEFAULT_BYTE_CACHE_SIZE_BYTES,
  DEFAULT_DECODED_CACHE_SIZE_BYTES,
  type CreateMultimodalResourcesClientOptions,
  type MultimodalResourcesClient,
} from "./types";

/**
 * Creates the source-agnostic resource client surface.
 */
export function createMultimodalResourcesClient(
  options: CreateMultimodalResourcesClientOptions = {}
): MultimodalResourcesClient {
  const byteCaches = {
    blockSizeBytes:
      options.caches?.bytes?.blockSizeBytes ?? defaultByteCacheBlockSizeBytes,
    memory:
      options.caches?.bytes?.memory ??
      createMemoryByteRangeCache({
        maxSizeBytes: DEFAULT_BYTE_CACHE_SIZE_BYTES,
      }),
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
    options.bytes ??
    createCachedByteResourceClient(createHttpByteResourceClient(), byteCaches);
  const decode =
    options.decode ??
    createDecodeResourceClient({
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
 * Default resource client.
 */
export const defaultMultimodalResourcesClient =
  createMultimodalResourcesClient();

/**
 * Public byte-cache constants and source profile values.
 */
export {
  BYTE_SOURCE_READ_PROFILE,
  DEFAULT_BYTE_CACHE_SIZE_BYTES,
  DEFAULT_DECODED_CACHE_SIZE_BYTES,
  DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
  DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
} from "./types";

/**
 * Public in-memory cache factories for custom resource client wiring.
 */
export {
  createMemoryByteRangeCache,
  createMemoryDecodedOutputCache,
} from "./cache";

/**
 * Public source, byte-resource, decode-resource, and cache contracts.
 */
export type {
  ByteCacheBlockSizeBytes,
  ByteCacheLayers,
  ByteRange,
  ByteRangeCache,
  ByteRangeReadRequest,
  ByteRangeReadResult,
  ByteResourceClient,
  ByteSourceDescriptor,
  ByteSourceReadProfile,
  CreateMultimodalResourcesClientOptions,
  DecodeCacheDescriptor,
  DecodedOutputCache,
  DecodedOutputCacheKey,
  DecodeExecutionRequest,
  DecodeExecutor,
  DecodeResourceClient,
  DecodeResourceRequest,
  DecodeResourceResult,
  MultimodalResourceCaches,
  MultimodalResourcesClient,
} from "./types";
