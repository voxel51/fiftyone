import type { McapIndexedReader, McapTypes } from "@mcap/core";
import type { ByteSourceDescriptor } from "../../../query/bytes";

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
  /**
   * Inclusive maximum log timestamp to read, in nanoseconds.
   */
  readonly endTimeNs?: bigint;

  /**
   * Maximum number of indexed entries to yield.
   */
  readonly limit?: number;

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
  readable: McapTypes.IReadable,
) => Promise<McapIndexedReaderLike>;

/**
 * Indexed MCAP reader surface used by this adapter.
 */
export interface McapIndexedReaderLike {
  /**
   * Summary channels keyed by numeric channel id.
   */
  readonly channelsById: McapIndexedReader["channelsById"];

  /**
   * Indexed chunk metadata used for timeline bounds and message-index scans.
   */
  readonly chunkIndexes: McapIndexedReader["chunkIndexes"];

  /**
   * Summary schemas keyed by numeric schema id.
   */
  readonly schemasById: McapIndexedReader["schemasById"];

  /**
   * Optional summary statistics from the MCAP footer section.
   */
  readonly statistics?: McapIndexedReader["statistics"];

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
  readMessages: McapIndexedReader["readMessages"];
}
