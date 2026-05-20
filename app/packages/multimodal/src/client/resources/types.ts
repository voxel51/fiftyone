import type { DecodeContext, Decoder, DecoderRegistry } from "../../decoders";
import type { DecodedOutput, PayloadDescriptor } from "../../decoders";
import type { BYTE_SOURCE_READ_PROFILE } from "./constants";

/**
 * Byte-source locality hint used to choose cache fill behavior.
 */
export type ByteSourceReadProfile =
  typeof BYTE_SOURCE_READ_PROFILE[keyof typeof BYTE_SOURCE_READ_PROFILE];

/**
 * Half-open byte range to read from a source.
 */
export interface ByteRange {
  /**
   * Zero-based byte offset where the read starts.
   */
  readonly offset: bigint;

  /**
   * Number of bytes to read from offset; the end is exclusive.
   */
  readonly length: bigint;
}

/**
 * Frontend-readable source identity for adapter byte readers.
 */
export interface ByteSourceDescriptor {
  /**
   * Optional source locality hint used to choose default cache fill size.
   */
  readonly readProfile?: ByteSourceReadProfile;

  /**
   * Stable source identity used in cache keys, independent of transient URLs.
   */
  readonly sourceId: string;

  /**
   * Frontend-readable URL or route path used by byte readers.
   */
  readonly url: string;

  /**
   * Decimal source size in bytes when known. This may come from sample
   * metadata, HEAD, or Content-Range, and is not part of source identity.
   */
  readonly sizeBytes?: string;
}

/**
 * Request for reading one source byte range.
 */
export interface ByteRangeReadRequest {
  /**
   * Per-read cache behavior overrides for callers with known access patterns.
   */
  readonly cachePolicy?: {
    /**
     * Whether cache wrappers may widen this read to a configured block fill.
     */
    readonly blockFill?: boolean;
  };

  /**
   * Source to read from.
   */
  readonly source: ByteSourceDescriptor;

  /**
   * Exact byte range the caller needs returned.
   */
  readonly range: ByteRange;
}

/**
 * Fixed or source-aware byte-cache fill block size.
 */
export type ByteCacheBlockSizeBytes =
  | number
  | ((request: ByteRangeReadRequest) => number | undefined);

/**
 * Bytes returned for one source byte range.
 */
export interface ByteRangeReadResult {
  /**
   * Source descriptor after reader-level metadata resolution, such as a
   * Content-Range size discovered by HTTP readers.
   */
  readonly source: ByteSourceDescriptor;

  /**
   * Exact byte range represented by bytes.
   */
  readonly range: ByteRange;

  /**
   * Raw bytes for range.
   */
  readonly bytes: Uint8Array;
}

/**
 * Generic client for reading source byte ranges.
 */
export interface ByteResourceClient {
  /**
   * Optionally resolves source metadata without reading bytes.
   */
  stat?(
    source: ByteSourceDescriptor
  ): Promise<ByteSourceDescriptor | undefined>;

  /**
   * Reads the requested source byte range and returns exactly that range.
   */
  readBytes(request: ByteRangeReadRequest): Promise<ByteRangeReadResult>;
}

/**
 * Cache contract for adapter byte-range reads.
 */
export interface ByteRangeCache {
  /**
   * Returns an exact cached read or a slice from a containing cached range.
   */
  get(request: ByteRangeReadRequest): Promise<ByteRangeReadResult | undefined>;

  /**
   * Stores bytes under the result's source and range identity.
   */
  put(result: ByteRangeReadResult): Promise<void>;

  /**
   * Evicts all cached byte ranges.
   */
  clear(): Promise<void>;
}

/**
 * Byte cache tiers used by resource clients.
 */
export interface ByteCacheLayers {
  /**
   * Fixed or request-derived block size used when read-through caches widen
   * small byte reads.
   */
  readonly blockSizeBytes?: ByteCacheBlockSizeBytes;

  /**
   * In-memory raw byte-range cache used by the default cached byte client.
   */
  readonly memory: ByteRangeCache;
}

/**
 * Record identity used to cache decoded payload output.
 */
export interface DecodeCacheDescriptor {
  /**
   * Optional discriminator for decoder settings that affect output for the
   * same encoded payload, such as active timeline interpretation.
   */
  readonly decoderOptionsKey?: string;

  /**
   * Source that produced the encoded payload, included when source identity is
   * needed to keep decoded outputs distinct.
   */
  readonly source?: ByteSourceDescriptor;

  /**
   * Stable record/message identity within the stream.
   */
  readonly recordId: string;

  /**
   * Stream identity that produced the payload.
   */
  readonly streamId: string;

  /**
   * Playback or source timeline timestamp for this decoded output, when the
   * payload is time-addressed.
   */
  readonly timeNs?: bigint;
}

/**
 * Request for decoding one encoded payload into playback/visualization output.
 */
export interface DecodeResourceRequest {
  /**
   * Encoded payload bytes passed to the selected decoder.
   */
  readonly bytes: Uint8Array;

  /**
   * Optional decoded-output cache identity. Omit for one-off decodes that
   * should not be reused.
   */
  readonly cache?: DecodeCacheDescriptor;

  /**
   * Runtime context supplied to decoders, such as stream id, schema data, and
   * source timestamps.
   */
  readonly context: DecodeContext;

  /**
   * Payload metadata used to select a compatible decoder.
   */
  readonly payload: PayloadDescriptor;
}

/**
 * Result of decoding one encoded payload.
 */
export interface DecodeResourceResult {
  /**
   * Identifier of the decoder that produced output.
   */
  readonly decoderId: string;

  /**
   * Decoder version included in cache identity and diagnostics.
   */
  readonly decoderVersion: string;

  /**
   * Decoded playback/visualization payload.
   */
  readonly output: DecodedOutput;

  /**
   * Payload descriptor that was decoded.
   */
  readonly payload: PayloadDescriptor;
}

/**
 * Request passed to the pluggable decode execution engine.
 */
export interface DecodeExecutionRequest {
  /**
   * Encoded payload bytes to decode.
   */
  readonly bytes: Uint8Array;

  /**
   * Runtime context forwarded to the decoder.
   */
  readonly context: DecodeContext;

  /**
   * Concrete decoder selected by the registry.
   */
  readonly decoder: Decoder;

  /**
   * Payload descriptor matched by decoder.
   */
  readonly payload: PayloadDescriptor;
}

/**
 * Execution strategy for decoder work. The default executor runs inline, while
 * hot playback callers can inject a worker-backed executor without changing the
 * cache/registry API.
 */
export interface DecodeExecutor {
  /**
   * Runs the selected decoder inline, in a worker, or through another execution
   * strategy.
   */
  decode(
    request: DecodeExecutionRequest
  ): DecodedOutput | Promise<DecodedOutput>;
}

/**
 * Fully resolved decoded cache key.
 */
export interface DecodedOutputCacheKey {
  /**
   * Identifier of the decoder that produced the cached output.
   */
  readonly decoderId: string;

  /**
   * Optional discriminator for decoder options that affect output.
   */
  readonly decoderOptionsKey?: string;

  /**
   * Decoder version used to invalidate stale decoded outputs.
   */
  readonly decoderVersion: string;

  /**
   * Payload metadata decoded into the cached output.
   */
  readonly payload: PayloadDescriptor;

  /**
   * Stable record/message identity within the stream.
   */
  readonly recordId: string;

  /**
   * Source identity included when equivalent record ids can appear across
   * different sources.
   */
  readonly source?: ByteSourceDescriptor;

  /**
   * Stream identity that produced the payload.
   */
  readonly streamId: string;

  /**
   * Playback or source timeline timestamp for time-addressed output.
   */
  readonly timeNs?: bigint;
}

/**
 * Cache contract for decoded playback/visualization outputs.
 */
export interface DecodedOutputCache {
  /**
   * Returns a cached decoded result for the fully resolved cache key.
   */
  get(key: DecodedOutputCacheKey): Promise<DecodeResourceResult | undefined>;

  /**
   * Stores a decoded result under the fully resolved cache key.
   */
  put(key: DecodedOutputCacheKey, result: DecodeResourceResult): Promise<void>;

  /**
   * Evicts all decoded outputs.
   */
  clear(): Promise<void>;
}

/**
 * Generic client for decoding payload bytes into playback/visualization outputs.
 */
export interface DecodeResourceClient {
  /**
   * Selects a decoder for the payload, optionally reuses cached output, and
   * returns the decoded visualization/playback result.
   */
  decode(request: DecodeResourceRequest): Promise<DecodeResourceResult>;
}

/**
 * Cache layers used by resource clients.
 */
export interface MultimodalResourceCaches {
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
 * Source-agnostic resource surface.
 */
export interface MultimodalResourcesClient {
  /**
   * Source-agnostic raw byte reader.
   */
  readonly bytes: ByteResourceClient;

  /**
   * Cache instances backing the default resource clients.
   */
  readonly caches: MultimodalResourceCaches;

  /**
   * Source-agnostic decode client for encoded payload bytes.
   */
  readonly decode: DecodeResourceClient;
}

/**
 * Options for constructing generic resource clients.
 */
export interface CreateMultimodalResourcesClientOptions {
  /**
   * Optional byte reader override, typically supplied by tests or adapter
   * environments that do not use HTTP Range requests.
   */
  readonly bytes?: ByteResourceClient;

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
  readonly decode?: DecodeResourceClient;

  /**
   * Decode execution override for worker-backed or otherwise off-thread decode
   * paths.
   */
  readonly decodeExecutor?: DecodeExecutor;
}
