import { McapStreamReader, type McapTypes } from "@mcap/core";
import type {
  McapIndexedMessageTime,
  McapIndexedReaderLike,
  McapReadIndexedMessageTimesRequest,
  ParsedMcapMessageIndexRecord,
} from "./types";

const MESSAGE_INDEX_RECORD_READER_OPTIONS: NonNullable<
  ConstructorParameters<typeof McapStreamReader>[0]
> = {
  // We parse a single MessageIndex record slice, not a full MCAP stream.
  noMagicPrefix: true,
  // Surface accidental Chunk ranges as the wrong record type before processing chunk contents.
  includeChunks: true,
  // MessageIndex records are not compressed Chunk records.
  decompressHandlers: {},
  // CRC validation only applies to chunk/attachment data, not MessageIndex records.
  validateCrcs: false,
};
const MCAP_RECORD_HEADER_BYTES = 9;
const MESSAGE_INDEX_CONTENT_HEADER_BYTES = 6;

/**
 * Reads ordered MCAP message times directly from chunk message-index records.
 */
export async function* readIndexedMessageTimesForReader(
  reader: McapIndexedReaderLike,
  readable: McapTypes.IReadable,
  args: McapReadIndexedMessageTimesRequest = {}
): AsyncGenerator<McapIndexedMessageTime, void, void> {
  if (
    args.limit !== undefined &&
    (!Number.isFinite(args.limit) ||
      !Number.isInteger(args.limit) ||
      args.limit <= 0)
  ) {
    return;
  }

  const channelIds = channelIdsForTopics(reader.channelsById, args.topics);
  if (channelIds.size === 0) {
    return;
  }

  if (chunksAreOrdered(reader.chunkIndexes)) {
    let count = 0;

    for (const chunkIndex of reader.chunkIndexes) {
      if (!chunkOverlapsRange(chunkIndex, args.startTimeNs, args.endTimeNs)) {
        if (
          args.endTimeNs !== undefined &&
          chunkIndex.messageStartTime > args.endTimeNs
        ) {
          return;
        }
        continue;
      }

      const chunkEntries = await readChunkIndexedMessageTimes({
        channelIds,
        chunkIndex,
        endTimeNs: args.endTimeNs,
        readable,
        reader,
        startTimeNs: args.startTimeNs,
      });

      for (const entry of chunkEntries) {
        yield entry;
        count += 1;

        if (args.limit !== undefined && count >= args.limit) {
          return;
        }
      }
    }

    return;
  }

  const entries: McapIndexedMessageTime[] = [];

  for (const chunkIndex of reader.chunkIndexes) {
    if (!chunkOverlapsRange(chunkIndex, args.startTimeNs, args.endTimeNs)) {
      continue;
    }

    entries.push(
      ...(await readChunkIndexedMessageTimes({
        channelIds,
        chunkIndex,
        endTimeNs: args.endTimeNs,
        readable,
        reader,
        startTimeNs: args.startTimeNs,
      }))
    );
  }

  entries.sort(compareIndexedMessageTimes);

  const limit = args.limit ?? entries.length;
  for (let index = 0; index < Math.min(limit, entries.length); index += 1) {
    const entry = entries[index];
    if (entry) {
      yield entry;
    }
  }
}

/**
 * Parses one raw MCAP MessageIndex record into channel offsets.
 */
export function parseMcapMessageIndexRecord(
  bytes: Uint8Array
): ParsedMcapMessageIndexRecord {
  const reader = new McapStreamReader(MESSAGE_INDEX_RECORD_READER_OPTIONS);
  reader.append(bytes);

  let record: McapTypes.TypedMcapRecord | undefined;
  try {
    record = reader.nextRecord();
  } catch (error) {
    throw new Error(
      `Expected MCAP MessageIndex record: ${errorMessage(
        error,
        "failed to parse record"
      )}`
    );
  }

  if (!record) {
    throw new Error("MCAP MessageIndex record is incomplete");
  }
  if (record.type !== "MessageIndex") {
    throw new Error(`Expected MCAP MessageIndex record, found ${record.type}`);
  }
  if (reader.bytesRemaining() !== 0) {
    throw new Error(
      `MCAP MessageIndex byte range has ${reader.bytesRemaining()} trailing bytes`
    );
  }
  assertMessageIndexRecordsFillRecord(bytes);

  return {
    channelId: record.channelId,
    records: record.records,
  };
}

function assertMessageIndexRecordsFillRecord(bytes: Uint8Array) {
  if (bytes.byteLength < MCAP_RECORD_HEADER_BYTES) {
    return;
  }

  // @mcap/core validates that it can parse a MessageIndex, but it can still
  // accept a record whose declared content has bytes after the records array.
  // Re-read the record header here so missing/extra record bytes fail loudly.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const recordLength = view.getBigUint64(1, true);
  if (recordLength > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      "MCAP MessageIndex record length exceeds safe number range"
    );
  }

  const recordEnd = MCAP_RECORD_HEADER_BYTES + Number(recordLength);
  const recordsStart =
    MCAP_RECORD_HEADER_BYTES + MESSAGE_INDEX_CONTENT_HEADER_BYTES;
  if (recordEnd < recordsStart) {
    throw new Error("MCAP MessageIndex record content is incomplete");
  }

  const recordsByteLength = view.getUint32(MCAP_RECORD_HEADER_BYTES + 2, true);
  const recordsEnd = recordsStart + recordsByteLength;
  if (recordsEnd !== recordEnd) {
    throw new Error(
      `MCAP MessageIndex records byte range mismatch: recordsStart=${recordsStart}, recordsEnd=${recordsEnd}, recordsByteLength=${recordsByteLength}, recordEnd=${recordEnd}, MCAP_RECORD_HEADER_BYTES=${MCAP_RECORD_HEADER_BYTES}, MESSAGE_INDEX_CONTENT_HEADER_BYTES=${MESSAGE_INDEX_CONTENT_HEADER_BYTES}`
    );
  }
}

async function readChunkIndexedMessageTimes({
  channelIds,
  chunkIndex,
  endTimeNs,
  readable,
  reader,
  startTimeNs,
}: {
  readonly channelIds: ReadonlySet<number>;
  readonly chunkIndex: McapTypes.TypedMcapRecords["ChunkIndex"];
  readonly endTimeNs: bigint | undefined;
  readonly readable: McapTypes.IReadable;
  readonly reader: McapIndexedReaderLike;
  readonly startTimeNs: bigint | undefined;
}): Promise<readonly McapIndexedMessageTime[]> {
  const entries: McapIndexedMessageTime[] = [];

  for (const channelId of channelIds) {
    const channel = reader.channelsById.get(channelId);
    if (!channel) {
      throw new Error(`Missing MCAP channel ${channelId}`);
    }

    const range = messageIndexRangeForChannel(chunkIndex, channelId);
    if (!range) {
      continue;
    }

    const bytes = await readExactRange(readable, range.offset, range.length);
    const messageIndex = parseMcapMessageIndexRecord(bytes);
    if (messageIndex.channelId !== channelId) {
      throw new Error(
        `MCAP MessageIndex channel ${messageIndex.channelId} did not match expected channel ${channelId}`
      );
    }

    for (const [logTimeNs, messageOffset] of messageIndex.records) {
      if (!isWithinIndexedRange(logTimeNs, startTimeNs, endTimeNs)) {
        continue;
      }

      entries.push({
        channelId,
        chunkStartOffset: chunkIndex.chunkStartOffset,
        logTimeNs,
        messageOffset,
        topic: channel.topic,
      });
    }
  }

  return entries.sort(compareIndexedMessageTimes);
}

function readExactRange(
  readable: McapTypes.IReadable,
  offset: bigint,
  size: bigint
): Promise<Uint8Array> {
  return (
    (
      readable as McapTypes.IReadable & {
        readExact?(offset: bigint, size: bigint): Promise<Uint8Array>;
      }
    ).readExact?.(offset, size) ?? readable.read(offset, size)
  );
}

function channelIdsForTopics(
  channelsById: ReadonlyMap<number, McapTypes.TypedMcapRecords["Channel"]>,
  topics: readonly string[] | undefined
): ReadonlySet<number> {
  const topicSet = topics === undefined ? undefined : new Set(topics);
  const channelIds = new Set<number>();

  for (const channel of channelsById.values()) {
    if (topicSet === undefined || topicSet.has(channel.topic)) {
      channelIds.add(channel.id);
    }
  }

  return channelIds;
}

function messageIndexRangeForChannel(
  chunkIndex: McapTypes.TypedMcapRecords["ChunkIndex"],
  channelId: number
): { readonly length: bigint; readonly offset: bigint } | undefined {
  const offset: bigint | undefined =
    chunkIndex.messageIndexOffsets.get(channelId);
  if (offset === undefined) {
    return undefined;
  }

  const offsets: bigint[] = [...chunkIndex.messageIndexOffsets.values()].sort(
    compareBigInt
  );
  const startOffset: bigint | undefined = offsets[0];
  if (startOffset === undefined) {
    return undefined;
  }

  const endOffset = startOffset + chunkIndex.messageIndexLength;
  let nextOffset: bigint = endOffset;
  for (const candidate of offsets) {
    if (candidate > offset && candidate < nextOffset) {
      nextOffset = candidate;
    }
  }

  if (nextOffset < offset) {
    throw new Error(
      `MCAP MessageIndex range for channel ${channelId} has a negative length`
    );
  }

  return {
    length: nextOffset - offset,
    offset,
  };
}

function chunkOverlapsRange(
  chunkIndex: McapTypes.TypedMcapRecords["ChunkIndex"],
  startTimeNs: bigint | undefined,
  endTimeNs: bigint | undefined
): boolean {
  if (startTimeNs !== undefined && chunkIndex.messageEndTime < startTimeNs) {
    return false;
  }
  if (endTimeNs !== undefined && chunkIndex.messageStartTime > endTimeNs) {
    return false;
  }

  return true;
}

function chunksAreOrdered(
  chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][]
): boolean {
  let previousEndTime: bigint | undefined;

  for (const chunkIndex of chunkIndexes) {
    if (
      previousEndTime !== undefined &&
      chunkIndex.messageStartTime < previousEndTime
    ) {
      return false;
    }

    previousEndTime = chunkIndex.messageEndTime;
  }

  return true;
}

function isWithinIndexedRange(
  logTimeNs: bigint,
  startTimeNs: bigint | undefined,
  endTimeNs: bigint | undefined
): boolean {
  if (startTimeNs !== undefined && logTimeNs < startTimeNs) {
    return false;
  }
  if (endTimeNs !== undefined && logTimeNs > endTimeNs) {
    return false;
  }

  return true;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function compareIndexedMessageTimes(
  left: McapIndexedMessageTime,
  right: McapIndexedMessageTime
) {
  const timeComparison = compareBigInt(left.logTimeNs, right.logTimeNs);
  if (timeComparison !== 0) {
    return timeComparison;
  }

  const chunkComparison = compareBigInt(
    left.chunkStartOffset,
    right.chunkStartOffset
  );
  if (chunkComparison !== 0) {
    return chunkComparison;
  }

  const offsetComparison = compareBigInt(
    left.messageOffset,
    right.messageOffset
  );
  if (offsetComparison !== 0) {
    return offsetComparison;
  }

  return left.channelId - right.channelId;
}

function compareBigInt(left: bigint, right: bigint) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }

  return 0;
}
