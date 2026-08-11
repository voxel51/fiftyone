import type { TimeWindow } from "../../../ir";
import type {
  BudgetedReadStopReason,
  ReadWorkBudget,
  ReadWorkUsage,
} from "../../../ports";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type {
  McapPrefetchChunkDataRequest,
  McapPrefetchWindowRequest,
} from "./prefetch-types";

/** Structural MCAP records used at the TypeScript 4.9 compatibility boundary. */
export interface McapChannel {
  readonly id: number;
  readonly messageEncoding: string;
  readonly metadata: Map<string, string>;
  readonly schemaId: number;
  readonly topic: string;
  readonly type: "Channel";
}

export interface McapChunkIndex {
  readonly chunkLength: bigint;
  readonly chunkStartOffset: bigint;
  readonly compressedSize: bigint;
  readonly compression: string;
  readonly messageEndTime: bigint;
  readonly messageIndexLength: bigint;
  readonly messageIndexOffsets: Map<number, bigint>;
  readonly messageStartTime: bigint;
  readonly type: "ChunkIndex";
  readonly uncompressedSize: bigint;
}

export interface McapMessage {
  readonly channelId: number;
  readonly data: Uint8Array;
  readonly logTime: bigint;
  readonly publishTime: bigint;
  readonly sequence: number;
  readonly type: "Message";
}

export interface McapSchema {
  readonly data: Uint8Array;
  readonly encoding: string;
  readonly id: number;
  readonly name: string;
  readonly type: "Schema";
}

/** Attachment summary fields consumed by recording inventory. */
export interface McapAttachmentIndex {
  readonly createTime: bigint;
  readonly dataSize: bigint;
  readonly length: bigint;
  readonly logTime: bigint;
  readonly mediaType: string;
  readonly name: string;
  readonly offset: bigint;
  readonly type: "AttachmentIndex";
}

/** Metadata summary fields consumed by recording inventory. */
export interface McapMetadataIndex {
  readonly length: bigint;
  readonly name: string;
  readonly offset: bigint;
  readonly type: "MetadataIndex";
}

export interface McapStatistics {
  readonly attachmentCount: number;
  readonly channelCount: number;
  readonly channelMessageCounts: Map<number, bigint>;
  readonly chunkCount: number;
  readonly messageCount: bigint;
  readonly messageEndTime: bigint;
  readonly messageStartTime: bigint;
  readonly metadataCount: number;
  readonly schemaCount: number;
  readonly type: "Statistics";
}

export interface McapReadable {
  read(offset: bigint, size: bigint): Promise<Uint8Array>;
  size(): Promise<bigint>;
  sourceIdentityForBytes?(bytes: Uint8Array): string | undefined;
}

/**
 * One timestamp and byte offset entry from an MCAP message index.
 */
export interface McapIndexedMessageTime {
  /**
   * Numeric MCAP channel id that owns the indexed message.
   */
  readonly channelId: number;

  /**
   * Absolute file offset of the chunk that contains the message.
   */
  readonly chunkStartOffset: bigint;

  /**
   * Message log timestamp in nanoseconds.
   */
  readonly logTimeNs: bigint;

  /**
   * Message byte offset within the chunk records.
   */
  readonly messageOffset: bigint;

  /**
   * Topic resolved from the indexed message's channel.
   */
  readonly topic: string;
}

/**
 * Filters for reading indexed MCAP message timestamps.
 */
export interface McapReadIndexedMessageTimesRequest {
  /** Optional exact channel ids, intersected with the topic filter. */
  readonly channelIds?: readonly number[];

  /**
   * Optional exact chunk offsets to inspect. This bounds index work and lets
   * callers guarantee that materialization touches only selected chunks.
   */
  readonly chunkStartOffsets?: readonly bigint[];

  /**
   * Inclusive maximum log timestamp to read, in nanoseconds.
   */
  readonly endTimeNs?: bigint;

  /**
   * Maximum number of indexed entries to yield.
   */
  readonly limit?: number;

  /** Cancels index range work owned by this request. */
  readonly signal?: AbortSignal;

  /**
   * Inclusive minimum log timestamp to read, in nanoseconds.
   */
  readonly startTimeNs?: bigint;

  /**
   * Topic names to include; omitting this reads all indexed topics.
   */
  readonly topics?: readonly string[];
}

/**
 * Filters for resolving the newest indexed entries at or before a time.
 */
export interface McapReadLatestIndexedMessageTimesRequest {
  /** Optional exact channel ids, intersected with the topic filter. */
  readonly channelIds?: readonly number[];

  /**
   * Inclusive upper bound: return the newest entries with log time at
   * or before this timestamp, however far back they are.
   */
  readonly timeNs: bigint;

  /**
   * Topic names to resolve; each topic gets an independent result.
   */
  readonly topics: readonly string[];

  /**
   * Newest-first entry count per topic; defaults to 1.
   */
  readonly limitPerTopic?: number;

  /**
   * Per-topic cap on chunk message-index reads during the walk.
   */
  readonly maxChunkProbesPerTopic?: number;

  /** Cancels the predecessor walk and its index range reads. */
  readonly signal?: AbortSignal;
}

/**
 * Filters for resolving per-topic first/last indexed message times.
 */
export interface McapReadTopicIndexedTimeBoundsRequest {
  /**
   * Topic names to resolve; each topic gets an independent result.
   */
  readonly topics: readonly string[];

  /**
   * Per-topic cap on chunk message-index reads during each walk.
   */
  readonly maxChunkProbesPerTopic?: number;
}

/**
 * First and last indexed message log times for one topic.
 */
export interface McapTopicIndexedTimeBounds {
  readonly firstLogTimeNs: bigint;
  readonly lastLogTimeNs: bigint;
}

/**
 * Parsed payload of one MCAP MessageIndex record.
 */
export interface ParsedMcapMessageIndexRecord {
  /**
   * Channel id encoded by the MessageIndex record.
   */
  readonly channelId: number;

  /**
   * Ordered log-time and message-offset entries from the record payload.
   */
  readonly records: readonly (readonly [
    logTimeNs: bigint,
    messageOffset: bigint,
  ])[];
}

/**
 * Reader factory used by MCAP production code and tests.
 */
export type McapReaderFactory = (
  source: ByteSourceDescriptor,
  readable: McapReadable,
) => Promise<McapIndexedReaderLike>;

/** Adapter-private exact position between atomic MCAP admission groups. */
export interface McapReadContinuation {
  readonly endTimeNs?: bigint;
  readonly nextChunkStartOffset: bigint;
  readonly preferredTimeNs?: bigint;
  readonly sourceKey: string;
  readonly startTimeNs?: bigint;
  readonly topicsKey: string;
  readonly version: 1;
}

/** One hard-bounded raw MCAP read issued below the decoded resource client. */
export interface McapBoundedMessageReadRequest {
  readonly absoluteBudget: ReadWorkBudget;
  readonly absoluteMaxChunks: number;
  readonly admissionEndNs?: bigint;
  readonly budget: ReadWorkBudget;
  readonly continuation?: McapReadContinuation;
  readonly endTimeNs?: bigint;
  readonly maxChunks: number;
  readonly maxGroups?: number;
  readonly preferredTimeNs?: bigint;
  readonly skipOversizedSourceUnit?: boolean;
  readonly signal?: AbortSignal;
  readonly startTimeNs?: bigint;
  readonly topics?: readonly string[];
}

/** Raw-message materialization for already-selected message-index entries. */
export interface McapReadIndexedMessagesRequest {
  readonly entries: readonly McapIndexedMessageTime[];
  readonly signal?: AbortSignal;
}

/** Raw messages and work evidence returned by the bounded MCAP executor. */
export interface McapBoundedMessageReadResult {
  readonly continuation?: McapReadContinuation;
  readonly coverageByTopic: ReadonlyMap<string, readonly TimeWindow[]>;
  /** Messages ordered globally by log time with deterministic source tie-breaks. */
  readonly messages: readonly McapMessage[];
  readonly resumeAtNs?: bigint;
  /** Atomic source spans intentionally skipped because they exceed the hard ceiling. */
  readonly skippedByTopic?: ReadonlyMap<string, readonly TimeWindow[]>;
  readonly stopReason: BudgetedReadStopReason;
  readonly usage: ReadWorkUsage;
}

/**
 * Indexed MCAP reader surface used by this adapter.
 */
export interface McapIndexedReaderLike {
  /** Releases all source-bound caches owned by this reader. */
  dispose?(): void;

  /** Attachment summary indexes retained during reader initialization. */
  readonly attachmentIndexes?: readonly McapAttachmentIndex[];

  /**
   * Summary channels keyed by numeric channel id.
   */
  readonly channelsById: ReadonlyMap<number, McapChannel>;

  /**
   * Indexed chunk metadata used for timeline bounds and message-index scans.
   */
  readonly chunkIndexes: readonly McapChunkIndex[];

  /** MCAP header retained during reader initialization. */
  readonly header?: Readonly<{
    library: string;
    profile: string;
    type: "Header";
  }>;

  /** Metadata summary indexes retained during reader initialization. */
  readonly metadataIndexes?: readonly McapMetadataIndex[];

  /**
   * Summary schemas keyed by numeric schema id.
   */
  readonly schemasById: ReadonlyMap<number, McapSchema>;

  /**
   * Optional summary statistics from the MCAP footer section.
   */
  readonly statistics?: McapStatistics;

  /**
   * Reads admitted chunks directly instead of delegating an unbounded window
   * to `readMessages()`.
   */
  readBoundedMessages?(
    request: McapBoundedMessageReadRequest,
  ): Promise<McapBoundedMessageReadResult>;

  /**
   * Resolves exact selected offsets through a stable decompressed-chunk cache.
   * Results correspond positionally to the requested entries.
   */
  readIndexedMessages?(
    request: McapReadIndexedMessagesRequest,
  ): Promise<readonly McapMessage[]>;

  /**
   * Reads timestamp-only message-index entries without decoding chunk records.
   */
  readIndexedMessageTimes?(
    args?: McapReadIndexedMessageTimesRequest,
  ): AsyncGenerator<McapIndexedMessageTime, void, void>;

  /**
   * Resolves the newest indexed entries at or before a time per topic,
   * with unbounded lookback, without decoding chunk records.
   */
  readLatestIndexedMessageTimes?(
    args: McapReadLatestIndexedMessageTimesRequest,
  ): Promise<ReadonlyMap<string, readonly McapIndexedMessageTime[]>>;

  /**
   * Resolves per-topic first/last indexed message times without
   * decoding chunk records.
   */
  readTopicIndexedTimeBounds?(
    args: McapReadTopicIndexedTimeBoundsRequest,
  ): Promise<ReadonlyMap<string, McapTopicIndexedTimeBounds | null>>;

  /**
   * Streams full MCAP messages through the core indexed reader API.
   */
  readMessages(args?: {
    readonly endTime?: bigint;
    readonly reverse?: boolean;
    readonly startTime?: bigint;
    readonly topics?: readonly string[];
    readonly validateCrcs?: boolean;
  }): AsyncGenerator<McapMessage, void, void>;

  /**
   * Warms the byte layer for the exact chunks an already-resolved read is
   * about to touch. Advisory; failures surface only through the real read.
   */
  prefetchChunkData?(request: McapPrefetchChunkDataRequest): Promise<void>;

  /**
   * Warms the byte layer for an upcoming indexed read over a log-time
   * window. Advisory; failures surface only through the real read.
   */
  prefetchWindow?(request: McapPrefetchWindowRequest): Promise<void>;
}

/** Minimal byte-readable contract consumed by the adapter's index readers. */
export interface McapReadable {
  read(offset: bigint, size: bigint): Promise<Uint8Array>;
  readExact?(
    offset: bigint,
    size: bigint,
    signal?: AbortSignal,
  ): Promise<Uint8Array>;
  size(): Promise<bigint>;
}
