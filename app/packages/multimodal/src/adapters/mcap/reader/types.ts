import type { McapIndexedReader, McapTypes } from "@mcap/core";
import type { ByteSourceDescriptor } from "../../../client/resources";

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
    messageOffset: bigint
  ])[];
}

/**
 * Reader factory used by MCAP production code and tests.
 */
export type McapReaderFactory = (
  source: ByteSourceDescriptor,
  readable: McapTypes.IReadable
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
    args?: McapReadIndexedMessageTimesRequest
  ): AsyncGenerator<McapIndexedMessageTime, void, void>;

  /**
   * Streams full MCAP messages through the core indexed reader API.
   */
  readMessages: McapIndexedReader["readMessages"];
}
