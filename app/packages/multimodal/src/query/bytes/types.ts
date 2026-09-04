import type {
  ByteRange,
  ByteSourceDescriptor,
  ByteSourceReadProfile,
} from "../../ir";

export type {
  ByteRange,
  ByteSourceDescriptor,
  ByteSourceReadProfile,
} from "../../ir";

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

    /**
     * Whether the durable layer may keep these bytes. Separate from
     * `blockFill`: refusing to widen a read says nothing about whether its
     * range is worth remembering again.
     */
    readonly persist?: boolean;

    /**
     * Whether a cache wrapper may queue autonomous successor-block readahead.
     * Bounded grants disable this so no unadmitted range outlives the grant.
     */
    readonly readahead?: boolean;
  };

  /**
   * Abort signal for the transport fetch behind this read. Coalesced reads
   * share one physical fetch, which follows the signal of the request that
   * started it — abort granularity is the physical fetch, not the waiter.
   */
  readonly signal?: AbortSignal;

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
  number | ((request: ByteRangeReadRequest) => number | undefined);

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

  /** Cache/fill attribution for this logical read when the client provides it. */
  readonly readUsage?: ByteRangeReadUsage;
}

/** Physical cache-fill outcome behind one logical byte-range result. */
export interface ByteRangeReadUsage {
  readonly cacheResult: ByteCacheReadResult;
  readonly fillRange: ByteRange;
  readonly transferredBytes: number;
}

export interface ByteReadDebugLog {
  readonly blockFill: boolean;
  readonly cacheResult: ByteCacheReadResult;
  readonly durationMs: number;
  readonly fetchedBytes: number;
  readonly fillLength: string;
  readonly fillOffset: string;
  readonly readProfile?: ByteSourceReadProfile;
  readonly requestedLength: string;
  readonly requestedOffset: string;
  readonly returnedBytes: number;
  readonly sourceId: string;
}

type ByteCacheReadResult =
  "coalesced" | "fill-hit" | "fetched" | "persistent-hit" | "request-hit";

export interface ByteReadDebugOptions {
  readonly enabled?: boolean;
  readonly log?: (entry: ByteReadDebugLog) => void;
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
    signal?: AbortSignal,
  ): Promise<ByteSourceDescriptor | undefined>;

  /**
   * Resolves the physical cache-fill range a read would admit without reading
   * bytes. Bounded adapters use this pure plan as their byte-budget authority.
   */
  planRead?(request: ByteRangeReadRequest): ByteRangeReadRequest;

  /**
   * Reads the requested source byte range and returns exactly that range.
   */
  readBytes(request: ByteRangeReadRequest): Promise<ByteRangeReadResult>;
}

/**
 * Minimal cross-context exclusive-lock surface used to single-flight
 * identical network block fills and to meter fill concurrency. It is
 * structurally compatible with the Web Locks API (`navigator.locks`),
 * which shares the Cache API's origin scope — together they make one
 * context's fetch every context's bytes. With `ifAvailable`, an
 * ungranted request invokes the callback with a falsy lock instead of
 * waiting, exactly like the Web Locks API.
 */
export interface ByteFillLockManager {
  request<T>(
    name: string,
    options: {
      readonly ifAvailable?: boolean;
      readonly mode: "exclusive";
      readonly signal?: AbortSignal;
    },
    callback: (lock: unknown) => Promise<T> | T,
  ): Promise<T>;
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
 * Slot class for a client's network block fills. "priority" fills may use
 * every fill slot including the reserved first one; "background" fills
 * (idle lookahead, bulk history scans) never take the reserved slot, so a
 * playback-critical fill always has one immediately available.
 */
export type ByteFillSlotClass = "background" | "priority";

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
   * Optional debug logging for logical byte requests, cache fills, and
   * transport-backed read durations.
   */
  readonly debug?: ByteReadDebugOptions;

  /**
   * In-memory raw byte-range cache used by the default cached byte client.
   */
  readonly memory: ByteRangeCache;

  /**
   * Always-on observer for completed logical byte reads, independent of
   * debug logging. Health/telemetry consumers use this to measure real
   * transport pressure (see `cacheResult`/`fetchedBytes` per entry).
   */
  readonly onRead?: (entry: ByteReadDebugLog) => void;

  /**
   * Persistent byte-range cache shared across execution contexts (main
   * thread and workers) and page loads. `false` disables the default
   * Cache API layer; omitting it lets clients construct the default.
   */
  readonly persistent?: ByteRangeCache | false;

  /**
   * Slot class this client's remote fills are metered under. Defaults to
   * "priority"; execution contexts that only do speculative or bulk work
   * declare "background" so they can never occupy the reserved slot.
   */
  readonly fillSlotClass?: ByteFillSlotClass;

  /**
   * Cross-context lock manager that single-flights identical block fills
   * across worker lanes, with the persistent layer as the handoff medium.
   * `false` disables locking; omitting it lets clients adopt
   * `navigator.locks` when the runtime provides it.
   */
  readonly locks?: ByteFillLockManager | false;
}
