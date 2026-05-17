import type { Decoder, DecoderRegistry } from "../../decoders";
import type { DecodedOutput, PayloadDescriptor } from "../../decoders";
import type { SourceFingerprint } from "../../schemas/v1";

const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * Default in-memory raw byte cache budget.
 */
export const DEFAULT_BYTE_CACHE_SIZE_BYTES = 128 * BYTES_PER_MEGABYTE;

/**
 * Default in-memory decoded output cache budget.
 */
export const DEFAULT_DECODED_CACHE_SIZE_BYTES = 64 * BYTES_PER_MEGABYTE;

/**
 * Default block size for local/unknown read-through byte cache fills.
 */
export const DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES = 2 * BYTES_PER_MEGABYTE;

/**
 * Default block size for remote/object-storage read-through byte cache fills.
 */
export const DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES =
  8 * BYTES_PER_MEGABYTE;

/**
 * Explicit source profile for byte-cache fill policy.
 */
export const BYTE_SOURCE_READ_PROFILE = Object.freeze({
  LOCAL: "local",
  REMOTE: "remote",
} as const);

export type ByteSourceReadProfile =
  typeof BYTE_SOURCE_READ_PROFILE[keyof typeof BYTE_SOURCE_READ_PROFILE];

/**
 * Half-open byte range to read from a source.
 */
export interface ByteRange {
  readonly offset: bigint;
  readonly length: bigint;
}

/**
 * Frontend-readable source identity for adapter byte readers.
 */
export interface ByteSourceDescriptor {
  readonly readProfile?: ByteSourceReadProfile;
  readonly sourceId: string;
  readonly url: string;
  readonly sizeBytes?: string;
  readonly fingerprint?: SourceFingerprint;
}

/**
 * Request for reading one source byte range.
 */
export interface ByteRangeReadRequest {
  readonly source: ByteSourceDescriptor;
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
  readonly source: ByteSourceDescriptor;
  readonly range: ByteRange;
  readonly bytes: Uint8Array;
}

/**
 * Generic client for reading source byte ranges.
 */
export interface ByteResourceClient {
  readBytes(request: ByteRangeReadRequest): Promise<ByteRangeReadResult>;
}

/**
 * Cache contract for adapter byte-range reads.
 */
export interface ByteRangeCache {
  get(request: ByteRangeReadRequest): Promise<ByteRangeReadResult | undefined>;

  put(result: ByteRangeReadResult): Promise<void>;

  clear(): Promise<void>;
}

/**
 * Byte cache tiers used by resource clients.
 */
export interface ByteCacheLayers {
  readonly blockSizeBytes?: ByteCacheBlockSizeBytes;
  readonly memory: ByteRangeCache;
}

/**
 * Record identity used to cache decoded payload output.
 */
export interface DecodeCacheDescriptor {
  readonly decoderOptionsKey?: string;
  readonly source?: ByteSourceDescriptor;
  readonly recordId: string;
  readonly streamId: string;
  readonly timeNs?: bigint;
}

/**
 * Request for decoding one encoded payload into playback/visualization output.
 */
export interface DecodeResourceRequest {
  readonly bytes: Uint8Array;
  readonly cache?: DecodeCacheDescriptor;
  readonly context: unknown;
  readonly payload: PayloadDescriptor;
  readonly schemaData?: Uint8Array;
}

/**
 * Result of decoding one encoded payload.
 */
export interface DecodeResourceResult {
  readonly decoderId: string;
  readonly decoderVersion: string;
  readonly output: DecodedOutput;
  readonly payload: PayloadDescriptor;
}

/**
 * Request passed to the pluggable decode execution engine.
 */
export interface DecodeExecutionRequest {
  readonly bytes: Uint8Array;
  readonly context: unknown;
  readonly decoder: Decoder;
  readonly payload: PayloadDescriptor;
  readonly schemaData?: Uint8Array;
}

/**
 * Execution strategy for decoder work. The default executor runs inline, while
 * hot playback callers can inject a worker-backed executor without changing the
 * cache/registry API.
 */
export interface DecodeExecutor {
  decode(
    request: DecodeExecutionRequest
  ): DecodedOutput | Promise<DecodedOutput>;
}

/**
 * Fully resolved decoded cache key.
 */
export interface DecodedOutputCacheKey {
  readonly decoderId: string;
  readonly decoderOptionsKey?: string;
  readonly decoderVersion: string;
  readonly payload: PayloadDescriptor;
  readonly recordId: string;
  readonly source?: ByteSourceDescriptor;
  readonly streamId: string;
  readonly timeNs?: bigint;
}

/**
 * Cache contract for decoded playback/visualization outputs.
 */
export interface DecodedOutputCache {
  get(key: DecodedOutputCacheKey): Promise<DecodeResourceResult | undefined>;

  put(key: DecodedOutputCacheKey, result: DecodeResourceResult): Promise<void>;

  clear(): Promise<void>;
}

/**
 * Generic client for decoding payload bytes into playback/visualization outputs.
 */
export interface DecodeResourceClient {
  decode(request: DecodeResourceRequest): Promise<DecodeResourceResult>;
}

/**
 * Cache layers used by resource clients.
 */
export interface MultimodalResourceCaches {
  readonly bytes: ByteCacheLayers;
  readonly decoded: DecodedOutputCache;
}

/**
 * Source-agnostic resource surface.
 */
export interface MultimodalResourcesClient {
  readonly bytes: ByteResourceClient;
  readonly caches: MultimodalResourceCaches;
  readonly decode: DecodeResourceClient;
}

/**
 * Options for constructing generic resource clients.
 */
export interface CreateMultimodalResourcesClientOptions {
  readonly bytes?: ByteResourceClient;
  readonly caches?: Partial<{
    readonly bytes: Partial<ByteCacheLayers>;
    readonly decoded: DecodedOutputCache;
  }>;
  readonly decoderRegistry?: DecoderRegistry;
  readonly decode?: DecodeResourceClient;
  readonly decodeExecutor?: DecodeExecutor;
}
