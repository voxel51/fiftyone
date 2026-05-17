import { McapIndexedReader, type McapTypes } from "@mcap/core";
import type { ByteResourceClient } from "../client";
import { loadMcapDecompressHandlers } from "./decompress/handlers";
import type { McapSourceDescriptor } from "./types";

type DecompressHandlers = McapTypes.DecompressHandlers;

/**
 * Seekable byte-readable source consumed by @mcap/core.
 */
export type McapReadable = McapTypes.IReadable;
type TypedMcapRecords = McapTypes.TypedMcapRecords;

type ExactMcapReadable = McapReadable & {
  readExact?(offset: bigint, size: bigint): Promise<Uint8Array>;
};

const MCAP_RECORD_HEADER_BYTES = 9;
const MCAP_MESSAGE_INDEX_OPCODE = 0x07;
const MESSAGE_INDEX_CONTENT_HEADER_BYTES = 6;
const MESSAGE_INDEX_RECORD_BYTES = 16;

export interface McapIndexedMessageTime {
  readonly channelId: number;
  readonly chunkStartOffset: bigint;
  readonly logTimeNs: bigint;
  readonly messageOffset: bigint;
  readonly topic: string;
}

export interface McapReadIndexedMessageTimesRequest {
  readonly endTimeNs?: bigint;
  readonly limit?: number;
  readonly startTimeNs?: bigint;
  readonly topics?: readonly string[];
}

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

export type McapInitializedReader = McapIndexedReaderLike & {
  readonly chunkIndexes: readonly TypedMcapRecords["ChunkIndex"][];
};

/**
 * Creates the default indexed MCAP reader with supported chunk decompressors.
 */
export async function createDefaultMcapReader(
  _source: McapSourceDescriptor,
  readable: McapReadable
): Promise<McapIndexedReaderLike> {
  const reader = await initializeDefaultMcapReader(
    readable,
    await loadMcapDecompressHandlers()
  );
  const chunkCompressions = compressedChunkTypes(reader);
  assertSupportedChunkCompressions(chunkCompressions);

  return {
    channelsById: reader.channelsById,
    chunkIndexes: reader.chunkIndexes,
    readIndexedMessageTimes: (args) =>
      readIndexedMessageTimesForReader(reader, readable, args),
    readMessages: (args) => reader.readMessages(args),
    schemasById: reader.schemasById,
  };
}

/**
 * Gets or initializes the cached reader promise for one MCAP source.
 */
export async function getReader(
  readers: Map<string, Promise<McapIndexedReaderLike>>,
  readerFactory: McapReaderFactory,
  byteClient: ByteResourceClient,
  source: McapSourceDescriptor
) {
  const key = sourceKey(source);
  let reader = readers.get(key);

  if (!reader) {
    reader = readerFactory(
      source,
      new ByteClientReadable(source, byteClient)
    ).catch((error) => {
      readers.delete(key);
      throw error;
    });
    readers.set(key, reader);
  }

  return reader;
}

async function initializeDefaultMcapReader(
  readable: McapReadable,
  decompressHandlers: DecompressHandlers
): Promise<McapInitializedReader> {
  return McapIndexedReader.Initialize({
    decompressHandlers,
    messageIndexCacheSizeBytes: 128 * 1024 * 1024,
    readable,
  });
}

function compressedChunkTypes(
  reader: McapInitializedReader
): ReadonlySet<string> {
  return new Set(
    reader.chunkIndexes
      .map((chunkIndex) => chunkIndex.compression)
      .filter((compression) => compression.length > 0)
  );
}

function assertSupportedChunkCompressions(compressions: ReadonlySet<string>) {
  const unsupported = [...compressions]
    .filter((compression) => compression !== "lz4" && compression !== "zstd")
    .sort();

  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported MCAP chunk compression: ${unsupported.join(
        ", "
      )}. Supported compressions are lz4 and zstd.`
    );
  }
}

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

class ByteClientReadable implements McapReadable {
  private source: McapSourceDescriptor;
  private resolvedSizeBytes?: bigint;

  constructor(
    source: McapSourceDescriptor,
    private readonly byteClient: ByteResourceClient
  ) {
    this.source = source;
  }

  async size(): Promise<bigint> {
    const sizeBytes = sourceSizeBytes(this.source);
    if (sizeBytes !== undefined) {
      return sizeBytes;
    }

    if (this.resolvedSizeBytes !== undefined) {
      return this.resolvedSizeBytes;
    }

    const result = await this.byteClient.readBytes({
      range: { length: 1n, offset: 0n },
      source: this.source,
    });
    this.updateSource(result.source);

    if (this.resolvedSizeBytes === undefined) {
      throw new Error("MCAP source size is required for indexed reads");
    }

    return this.resolvedSizeBytes;
  }

  async read(offset: bigint, size: bigint): Promise<Uint8Array> {
    return this.readRange(offset, size);
  }

  async readExact(offset: bigint, size: bigint): Promise<Uint8Array> {
    return this.readRange(offset, size, { blockFill: false });
  }

  private async readRange(
    offset: bigint,
    size: bigint,
    cachePolicy?: { readonly blockFill?: boolean }
  ): Promise<Uint8Array> {
    const sourceSize = sourceSizeBytes(this.source) ?? this.resolvedSizeBytes;
    if (sourceSize !== undefined && offset + size > sourceSize) {
      throw new Error(
        `Read of ${size.toString()} bytes at offset ${offset.toString()} exceeds source size ${sourceSize.toString()}`
      );
    }

    if (size === 0n) {
      return new Uint8Array();
    }

    const result = await this.byteClient.readBytes({
      cachePolicy,
      range: { length: size, offset },
      source: this.source,
    });
    this.updateSource(result.source);

    return result.bytes;
  }

  private updateSource(source: McapSourceDescriptor) {
    const sizeBytes = sourceSizeBytes(source);
    if (sizeBytes !== undefined) {
      this.resolvedSizeBytes = sizeBytes;
      this.source = source;
    }
  }
}

function sourceSizeBytes(source: McapSourceDescriptor): bigint | undefined {
  const sizeBytes = source.sizeBytes ?? source.fingerprint?.sizeBytes;
  return sizeBytes === undefined ? undefined : BigInt(sizeBytes);
}

function sourceKey(source: McapSourceDescriptor): string {
  return [
    source.sourceId,
    source.url,
    source.sizeBytes ?? source.fingerprint?.sizeBytes ?? "",
    source.fingerprint?.firstChunkCrc?.toString() ?? "",
    source.fingerprint?.lastChunkCrc?.toString() ?? "",
  ].join("|");
}
