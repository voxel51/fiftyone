import type { BYTE_SOURCE_READ_PROFILE } from "./constants";

/**
 * Byte-source locality hint used to choose cache fill behavior.
 */
export type ByteSourceReadProfile =
  (typeof BYTE_SOURCE_READ_PROFILE)[keyof typeof BYTE_SOURCE_READ_PROFILE];

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
export interface ByteClient {
  /**
   * Optionally resolves source metadata without reading bytes.
   */
  stat?(
    source: ByteSourceDescriptor,
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
 * Byte cache tiers used by byte query clients.
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
