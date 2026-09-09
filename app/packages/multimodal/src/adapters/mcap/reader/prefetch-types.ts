/** One byte range a prefetch pass should warm. */
export interface McapPrefetchByteRange {
  readonly length: bigint;
  readonly offset: bigint;
}

/** Log-time window prefetch request for an upcoming indexed read. */
export interface McapPrefetchWindowRequest {
  /** Inclusive maximum log timestamp, in nanoseconds. */
  readonly endTimeNs?: bigint;
  /** Warm chunk record data for the window. Defaults to true. */
  readonly includeChunkData?: boolean;
  /** Warm chunk message-index regions for the window. Defaults to true. */
  readonly includeMessageIndexes?: boolean;
  /** Cap on chunks warmed by this pass; earliest chunks win. */
  readonly maxChunks?: number;
  /** Cap on concurrently in-flight prefetch reads. */
  readonly maxConcurrentReads?: number;
  /** Inclusive minimum log timestamp, in nanoseconds. */
  readonly startTimeNs?: bigint;
  /** Topics whose chunks should be warmed; omitting warms all topics. */
  readonly topics?: readonly string[];
}

/** Exact chunk-set prefetch request for already resolved messages. */
export interface McapPrefetchChunkDataRequest {
  /** Absolute file offsets of the chunks about to be read. */
  readonly chunkStartOffsets: Iterable<bigint>;
  /** Cap on chunks warmed by this pass; earliest chunks win. */
  readonly maxChunks?: number;
  /** Cap on concurrently in-flight prefetch reads. */
  readonly maxConcurrentReads?: number;
}
