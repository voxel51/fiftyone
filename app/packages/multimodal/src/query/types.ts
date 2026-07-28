import type { DecoderRegistry } from "../decoders";
import type { ByteCacheLayers, ByteClient } from "./bytes";
import type {
  DecodedOutputCache,
  DecodeExecutor,
  DecodeClient,
} from "./decode";

/**
 * Cache layers used by query clients.
 */
export interface MultimodalQueryCaches {
  /**
   * Raw byte cache configuration shared by byte clients and adapter wrappers.
   */
  readonly bytes: ByteCacheLayers;

  /**
   * Cache for decoded playback/visualization outputs.
   */
  readonly decoded: DecodedOutputCache;
}

/**
 * Source-agnostic query surface.
 */
export interface MultimodalQueryClient {
  /**
   * Source-agnostic raw byte reader.
   */
  readonly bytes: ByteClient;

  /**
   * Cache instances backing the default query clients.
   */
  readonly caches: MultimodalQueryCaches;

  /**
   * Source-agnostic decode client for encoded payload bytes.
   */
  readonly decode: DecodeClient;
}

/**
 * Options for constructing generic query clients.
 */
export interface CreateMultimodalQueryClientOptions {
  /**
   * Optional byte reader override, typically supplied by tests or adapter
   * environments that do not use HTTP Range requests.
   */
  readonly bytes?: ByteClient;

  /**
   * Optional cache overrides. Missing layers are filled with default in-memory
   * caches.
   */
  readonly caches?: Partial<{
    /**
     * Raw byte cache-layer overrides.
     */
    readonly bytes: Partial<ByteCacheLayers>;

    /**
     * Decoded-output cache override.
     */
    readonly decoded: DecodedOutputCache;
  }>;

  /**
   * Decoder registry override used when constructing the default decode client.
   */
  readonly decoderRegistry?: DecoderRegistry;

  /**
   * Decode client override for callers that own decoding and caching.
   */
  readonly decode?: DecodeClient;

  /**
   * Decode execution override for worker-backed or otherwise off-thread decode
   * paths.
   */
  readonly decodeExecutor?: DecodeExecutor;
}
