import type { McapTypes } from "@mcap/core";
import type { McapSourceDescriptor } from "../types";

/**
 * Seekable byte-readable source consumed by @mcap/core.
 */
export type McapReadable = McapTypes.IReadable;

type TypedMcapRecords = McapTypes.TypedMcapRecords;

/**
 * One timestamp and byte offset entry from an MCAP message index.
 */
export interface McapIndexedMessageTime {
  readonly channelId: number;
  readonly chunkStartOffset: bigint;
  readonly logTimeNs: bigint;
  readonly messageOffset: bigint;
  readonly topic: string;
}

/**
 * Filters for reading indexed MCAP message timestamps.
 */
export interface McapReadIndexedMessageTimesRequest {
  readonly endTimeNs?: bigint;
  readonly limit?: number;
  readonly startTimeNs?: bigint;
  readonly topics?: readonly string[];
}

/**
 * Parsed payload of one MCAP MessageIndex record.
 */
export interface ParsedMcapMessageIndexRecord {
  readonly channelId: number;
  readonly records: readonly (readonly [
    logTimeNs: bigint,
    messageOffset: bigint
  ])[];
}

/**
 * Reader factory used by MCAP production code and tests.
 */
export type McapReaderFactory = (
  source: McapSourceDescriptor,
  readable: McapReadable
) => Promise<McapIndexedReaderLike>;

/**
 * Indexed MCAP reader surface used by this adapter.
 */
export interface McapIndexedReaderLike {
  readonly channelsById: ReadonlyMap<number, TypedMcapRecords["Channel"]>;
  readonly chunkIndexes: readonly TypedMcapRecords["ChunkIndex"][];
  readonly schemasById: ReadonlyMap<number, TypedMcapRecords["Schema"]>;

  readIndexedMessageTimes?(
    args?: McapReadIndexedMessageTimesRequest
  ): AsyncGenerator<McapIndexedMessageTime, void, void>;

  readMessages(args?: {
    readonly endTime?: bigint;
    readonly startTime?: bigint;
    readonly topics?: readonly string[];
  }): AsyncGenerator<TypedMcapRecords["Message"], void, void>;
}

/**
 * Initialized MCAP reader with chunk index metadata available.
 */
export type McapInitializedReader = McapIndexedReaderLike & {
  readonly chunkIndexes: readonly TypedMcapRecords["ChunkIndex"][];
};
