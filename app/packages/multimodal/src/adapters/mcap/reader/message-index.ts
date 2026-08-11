import { compareBigInt } from "../../../ir";
import { throwIfAborted } from "../../../utils/cancellation";
import type {
  McapChannel,
  McapChunkIndex,
  McapIndexedMessageTime,
  McapIndexedReaderLike,
  McapReadable,
  McapReadIndexedMessageTimesRequest,
  ParsedMcapMessageIndexRecord,
} from "./types";

const MCAP_MESSAGE_INDEX_OPCODE = 0x07;
const MCAP_RECORD_HEADER_BYTES = 9;
const MESSAGE_INDEX_CONTENT_HEADER_BYTES = 6;
const MAX_MESSAGE_INDEX_BATCH_SPAN_BYTES = 64n * 1024n;

interface MessageIndexRead {
  readonly channel: McapChannel;
  readonly range: {
    readonly length: bigint;
    readonly offset: bigint;
  };
}

/** Exact, possibly coalesced MessageIndex range selected for one chunk. */
export interface McapMessageIndexReadRange {
  readonly length: bigint;
  readonly offset: bigint;
}

/**
 * Reads ordered MCAP message times directly from chunk message-index records.
 */
export async function* readIndexedMessageTimesForReader(
  reader: McapIndexedReaderLike,
  readable: McapReadable,
  args: McapReadIndexedMessageTimesRequest = {},
): AsyncGenerator<McapIndexedMessageTime, void, void> {
  throwIfAborted(args.signal);
  if (
    args.limit !== undefined &&
    (!Number.isFinite(args.limit) ||
      !Number.isInteger(args.limit) ||
      args.limit <= 0)
  ) {
    return;
  }

  const topicChannelIds = channelIdsForTopics(reader.channelsById, args.topics);
  const channelIds = args.channelIds
    ? new Set(
        args.channelIds.filter((channelId) => topicChannelIds.has(channelId)),
      )
    : topicChannelIds;
  if (channelIds.size === 0) {
    return;
  }

  const requestedChunkOffsets = args.chunkStartOffsets
    ? new Set(args.chunkStartOffsets)
    : undefined;
  const chunkIndexes: readonly McapChunkIndex[] = requestedChunkOffsets
    ? reader.chunkIndexes.filter((chunkIndex) =>
        requestedChunkOffsets.has(chunkIndex.chunkStartOffset),
      )
    : reader.chunkIndexes;
  if (chunkIndexes.length === 0) {
    return;
  }

  if (chunksAreOrdered(chunkIndexes)) {
    let count = 0;

    for (const chunkIndex of chunkIndexes) {
      throwIfAborted(args.signal);
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
        signal: args.signal,
        startTimeNs: args.startTimeNs,
      });
      throwIfAborted(args.signal);

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

  for (const chunkIndex of chunkIndexes) {
    throwIfAborted(args.signal);
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
        signal: args.signal,
        startTimeNs: args.startTimeNs,
      })),
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
  bytes: Uint8Array,
): ParsedMcapMessageIndexRecord {
  if (bytes.byteLength < MCAP_RECORD_HEADER_BYTES) {
    throw new Error("MCAP MessageIndex record is incomplete");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(0) !== MCAP_MESSAGE_INDEX_OPCODE) {
    throw new Error("Expected MCAP MessageIndex record");
  }
  const recordLength = view.getBigUint64(1, true);
  if (recordLength > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      "MCAP MessageIndex record length exceeds safe number range",
    );
  }
  const recordEnd = MCAP_RECORD_HEADER_BYTES + Number(recordLength);
  if (recordEnd > bytes.byteLength) {
    throw new Error("MCAP MessageIndex record is incomplete");
  }
  if (recordEnd < bytes.byteLength) {
    throw new Error(
      `MCAP MessageIndex byte range has ${bytes.byteLength - recordEnd} trailing bytes`,
    );
  }
  assertMessageIndexRecordsFillRecord(bytes);

  const channelId = view.getUint16(MCAP_RECORD_HEADER_BYTES, true);
  const recordsByteLength = view.getUint32(MCAP_RECORD_HEADER_BYTES + 2, true);
  const records: Array<readonly [bigint, bigint]> = [];
  const recordsStart =
    MCAP_RECORD_HEADER_BYTES + MESSAGE_INDEX_CONTENT_HEADER_BYTES;
  for (
    let offset = recordsStart;
    offset < recordsStart + recordsByteLength;
    offset += 16
  ) {
    records.push([
      view.getBigUint64(offset, true),
      view.getBigUint64(offset + 8, true),
    ]);
  }

  return { channelId, records };
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
      "MCAP MessageIndex record length exceeds safe number range",
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
      `MCAP MessageIndex records byte range mismatch: recordsStart=${recordsStart}, recordsEnd=${recordsEnd}, recordsByteLength=${recordsByteLength}, recordEnd=${recordEnd}, MCAP_RECORD_HEADER_BYTES=${MCAP_RECORD_HEADER_BYTES}, MESSAGE_INDEX_CONTENT_HEADER_BYTES=${MESSAGE_INDEX_CONTENT_HEADER_BYTES}`,
    );
  }
}

/**
 * Reads one chunk's message-index entries for the given channels — a
 * footer-only read; chunk message data is never decompressed. Entries
 * are filtered to the optional inclusive time bounds and returned
 * sorted ascending.
 */
export async function readChunkIndexedMessageTimes({
  channelIds,
  chunkIndex,
  endTimeNs,
  readExact,
  readable,
  reader,
  signal,
  startTimeNs,
}: {
  readonly channelIds: ReadonlySet<number>;
  readonly chunkIndex: McapChunkIndex;
  readonly endTimeNs: bigint | undefined;
  readonly readExact?: (
    offset: bigint,
    size: bigint,
    signal?: AbortSignal,
  ) => Promise<Uint8Array>;
  readonly readable: McapReadable;
  readonly reader: McapIndexedReaderLike;
  readonly signal?: AbortSignal;
  readonly startTimeNs: bigint | undefined;
}): Promise<readonly McapIndexedMessageTime[]> {
  const entries: McapIndexedMessageTime[] = [];
  const reads = collectMessageIndexReads({
    channelIds,
    chunkIndex,
    reader,
  });

  for (const batch of batchMessageIndexReads(reads)) {
    throwIfAborted(signal);
    const batchEnd = batch.reduce((end, read) => {
      const readEnd = read.range.offset + read.range.length;
      return readEnd > end ? readEnd : end;
    }, batch[0].range.offset);
    const batchOffset = batch[0].range.offset;
    const batchBytes = readExact
      ? await (signal
          ? readExact(batchOffset, batchEnd - batchOffset, signal)
          : readExact(batchOffset, batchEnd - batchOffset))
      : await readExactRange(
          readable,
          batchOffset,
          batchEnd - batchOffset,
          signal,
        );
    throwIfAborted(signal);

    for (const { channel, range } of batch) {
      const relativeOffset = Number(range.offset - batchOffset);
      const relativeEnd = relativeOffset + Number(range.length);
      const bytes = batchBytes.subarray(relativeOffset, relativeEnd);
      const messageIndex = parseMcapMessageIndexRecord(bytes);
      if (messageIndex.channelId !== channel.id) {
        throw new Error(
          `MCAP MessageIndex channel ${messageIndex.channelId} did not match expected channel ${channel.id}`,
        );
      }

      for (const [logTimeNs, messageOffset] of messageIndex.records) {
        if (!isWithinIndexedRange(logTimeNs, startTimeNs, endTimeNs)) {
          continue;
        }

        entries.push({
          channelId: channel.id,
          chunkStartOffset: chunkIndex.chunkStartOffset,
          logTimeNs,
          messageOffset,
          topic: channel.topic,
        });
      }
    }
  }

  return entries.sort(compareIndexedMessageTimes);
}

/**
 * Plans the exact MessageIndex reads used by
 * `readChunkIndexedMessageTimes()`, without touching source bytes.
 */
export function collectChunkMessageIndexReadRanges({
  channelIds,
  chunkIndex,
  reader,
}: {
  readonly channelIds: ReadonlySet<number>;
  readonly chunkIndex: McapChunkIndex;
  readonly reader: McapIndexedReaderLike;
}): readonly McapMessageIndexReadRange[] {
  return batchMessageIndexReads(
    collectMessageIndexReads({ channelIds, chunkIndex, reader }),
  ).map((batch) => {
    const offset = batch[0].range.offset;
    const end = batch.reduce((batchEnd, read) => {
      const readEnd = read.range.offset + read.range.length;
      return readEnd > batchEnd ? readEnd : batchEnd;
    }, offset);
    return { length: end - offset, offset };
  });
}

function collectMessageIndexReads({
  channelIds,
  chunkIndex,
  reader,
}: {
  readonly channelIds: ReadonlySet<number>;
  readonly chunkIndex: McapChunkIndex;
  readonly reader: McapIndexedReaderLike;
}): MessageIndexRead[] {
  const reads: MessageIndexRead[] = [];
  for (const channelId of channelIds) {
    const channel = reader.channelsById.get(channelId);
    if (!channel) {
      throw new Error(`Missing MCAP channel ${channelId}`);
    }
    const range = messageIndexRangeForChannel(chunkIndex, channelId);
    if (range) {
      reads.push({ channel, range });
    }
  }
  return reads.sort((left, right) =>
    compareBigInt(left.range.offset, right.range.offset),
  );
}

/**
 * Coalesces nearby selected MessageIndex records into bounded exact reads.
 * The MCAP footer stores these records contiguously by chunk, so this avoids
 * paying one remote round trip per active channel without turning sparse
 * selections into an unbounded footer fetch.
 */
function batchMessageIndexReads(
  reads: readonly MessageIndexRead[],
): readonly (readonly MessageIndexRead[])[] {
  const batches: MessageIndexRead[][] = [];

  for (const read of reads) {
    const batch = batches.at(-1);
    if (!batch) {
      batches.push([read]);
      continue;
    }

    const span = read.range.offset + read.range.length - batch[0].range.offset;
    if (span > MAX_MESSAGE_INDEX_BATCH_SPAN_BYTES) {
      batches.push([read]);
      continue;
    }

    batch.push(read);
  }

  return batches;
}

function readExactRange(
  readable: McapReadable,
  offset: bigint,
  size: bigint,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!readable.readExact) return readable.read(offset, size);
  return signal
    ? readable.readExact(offset, size, signal)
    : readable.readExact(offset, size);
}

/**
 * Resolves the channel-id set behind the requested topics (a topic can
 * map to multiple channels). Undefined topics selects every channel.
 */
export function channelIdsForTopics(
  channelsById: ReadonlyMap<number, McapChannel>,
  topics: readonly string[] | undefined,
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
  chunkIndex: McapChunkIndex,
  channelId: number,
): { readonly length: bigint; readonly offset: bigint } | undefined {
  const offset: bigint | undefined =
    chunkIndex.messageIndexOffsets.get(channelId);
  if (offset === undefined) {
    return undefined;
  }

  const offsets: bigint[] = [...chunkIndex.messageIndexOffsets.values()].sort(
    compareBigInt,
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
      `MCAP MessageIndex range for channel ${channelId} has a negative length`,
    );
  }

  return {
    length: nextOffset - offset,
    offset,
  };
}

function chunkOverlapsRange(
  chunkIndex: McapChunkIndex,
  startTimeNs: bigint | undefined,
  endTimeNs: bigint | undefined,
): boolean {
  if (startTimeNs !== undefined && chunkIndex.messageEndTime < startTimeNs) {
    return false;
  }
  if (endTimeNs !== undefined && chunkIndex.messageStartTime > endTimeNs) {
    return false;
  }

  return true;
}

function chunksAreOrdered(chunkIndexes: readonly McapChunkIndex[]): boolean {
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
  endTimeNs: bigint | undefined,
): boolean {
  if (startTimeNs !== undefined && logTimeNs < startTimeNs) {
    return false;
  }
  if (endTimeNs !== undefined && logTimeNs > endTimeNs) {
    return false;
  }

  return true;
}

/**
 * Deterministic ascending order for indexed message entries: log time,
 * then chunk offset, message offset, channel id.
 */
export function compareIndexedMessageTimes(
  left: McapIndexedMessageTime,
  right: McapIndexedMessageTime,
) {
  const timeComparison = compareBigInt(left.logTimeNs, right.logTimeNs);
  if (timeComparison !== 0) {
    return timeComparison;
  }

  const chunkComparison = compareBigInt(
    left.chunkStartOffset,
    right.chunkStartOffset,
  );
  if (chunkComparison !== 0) {
    return chunkComparison;
  }

  const offsetComparison = compareBigInt(
    left.messageOffset,
    right.messageOffset,
  );
  if (offsetComparison !== 0) {
    return offsetComparison;
  }

  return left.channelId - right.channelId;
}
