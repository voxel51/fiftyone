import type { McapTypes } from "@mcap/core";
import type {
  McapIndexedMessageTime,
  McapInitializedReader,
  McapReadable,
  McapReadIndexedMessageTimesRequest,
  ParsedMcapMessageIndexRecord,
} from "./types";

type TypedMcapRecords = McapTypes.TypedMcapRecords;

type ExactMcapReadable = McapReadable & {
  readExact?(offset: bigint, size: bigint): Promise<Uint8Array>;
};

const MCAP_RECORD_HEADER_BYTES = 9;
const MCAP_MESSAGE_INDEX_OPCODE = 0x07;
const MESSAGE_INDEX_CONTENT_HEADER_BYTES = 6;
const MESSAGE_INDEX_RECORD_BYTES = 16;

/**
 * Reads ordered MCAP message times directly from chunk message-index records.
 */
export async function* readIndexedMessageTimesForReader(
  reader: McapInitializedReader,
  readable: McapReadable,
  args: McapReadIndexedMessageTimesRequest = {}
): AsyncGenerator<McapIndexedMessageTime, void, void> {
  if (args.limit !== undefined && args.limit <= 0) {
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
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < MCAP_RECORD_HEADER_BYTES) {
    throw new Error("MCAP message index record is missing its record header");
  }

  const opcode = view.getUint8(0);
  if (opcode !== MCAP_MESSAGE_INDEX_OPCODE) {
    throw new Error(
      `Expected MCAP MessageIndex record, found opcode ${opcode}`
    );
  }

  const recordLength = view.getBigUint64(1, true);
  if (recordLength > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `MCAP MessageIndex record length is too large: ${recordLength.toString()} bytes`
    );
  }

  const recordLengthNumber = Number(recordLength);
  if (recordLengthNumber < MESSAGE_INDEX_CONTENT_HEADER_BYTES) {
    throw new Error(
      `MCAP MessageIndex record length ${recordLengthNumber} is too small`
    );
  }

  const recordEnd = MCAP_RECORD_HEADER_BYTES + recordLengthNumber;
  if (recordEnd > view.byteLength) {
    throw new Error(
      `MCAP MessageIndex record length ${recordLengthNumber} exceeds available bytes ${view.byteLength}`
    );
  }
  if (recordEnd !== view.byteLength) {
    throw new Error(
      `MCAP MessageIndex byte range has ${
        view.byteLength - recordEnd
      } trailing bytes`
    );
  }

  const channelId = view.getUint16(MCAP_RECORD_HEADER_BYTES, true);
  const recordsByteLength = view.getUint32(MCAP_RECORD_HEADER_BYTES + 2, true);
  if (recordsByteLength % MESSAGE_INDEX_RECORD_BYTES !== 0) {
    throw new Error(
      `MCAP MessageIndex records length ${recordsByteLength} is not divisible by ${MESSAGE_INDEX_RECORD_BYTES}`
    );
  }

  const recordsStart =
    MCAP_RECORD_HEADER_BYTES + MESSAGE_INDEX_CONTENT_HEADER_BYTES;
  const recordsEnd = recordsStart + recordsByteLength;
  if (recordsEnd > recordEnd) {
    throw new Error(
      `MCAP MessageIndex records length ${recordsByteLength} exceeds record bounds`
    );
  }

  const records: Array<readonly [bigint, bigint]> = [];
  for (
    let offset = recordsStart;
    offset < recordsEnd;
    offset += MESSAGE_INDEX_RECORD_BYTES
  ) {
    records.push([
      view.getBigUint64(offset, true),
      view.getBigUint64(offset + 8, true),
    ]);
  }

  return {
    channelId,
    records,
  };
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
  readonly chunkIndex: TypedMcapRecords["ChunkIndex"];
  readonly endTimeNs: bigint | undefined;
  readonly readable: McapReadable;
  readonly reader: McapInitializedReader;
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
  readable: McapReadable,
  offset: bigint,
  size: bigint
): Promise<Uint8Array> {
  return (
    (readable as ExactMcapReadable).readExact?.(offset, size) ??
    readable.read(offset, size)
  );
}

function channelIdsForTopics(
  channelsById: ReadonlyMap<number, TypedMcapRecords["Channel"]>,
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
  chunkIndex: TypedMcapRecords["ChunkIndex"],
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
  chunkIndex: TypedMcapRecords["ChunkIndex"],
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
  chunkIndexes: readonly TypedMcapRecords["ChunkIndex"][]
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
