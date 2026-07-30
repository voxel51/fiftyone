import type { McapTypes } from "@mcap/core";
import { crc32 } from "@foxglove/crc";
import { LRUCache } from "lru-cache";
import { safeNumber } from "../../../query/bytes/bigint-utils";
import { ByteClientReadable } from "./byte-readable";
import type {
  McapIndexedMessageTime,
  McapIndexedReaderLike,
  McapReadIndexedMessagesRequest,
} from "./types";

const DEFAULT_INDEXED_DECOMPRESSED_CACHE_BYTES = 64 * 1024 * 1024;
const MCAP_CHUNK_OPCODE = 0x06;
const MCAP_MESSAGE_OPCODE = 0x05;
const MCAP_RECORD_HEADER_BYTES = 9;
const MCAP_MESSAGE_PREFIX_BYTES = 2 + 4 + 8 + 8;
const MIN_CHUNK_RECORD_BYTES = MCAP_RECORD_HEADER_BYTES + 8 + 8 + 8 + 4 + 4 + 8;
const textDecoder = new TextDecoder();

type McapChunkIndex = McapTypes.TypedMcapRecords["ChunkIndex"];
type McapMessage = McapTypes.TypedMcapRecords["Message"];
type McapIndexedMessageReader = (
  request: McapReadIndexedMessagesRequest,
) => Promise<readonly McapMessage[]>;

/** Dependencies for one source-bound exact indexed-message reader. */
export interface CreateMcapIndexedMessageReaderOptions {
  readonly decompressHandlers: McapTypes.DecompressHandlers;
  readonly maxCacheSizeBytes?: number;
  readonly readable: ByteClientReadable;
  readonly reader: McapIndexedReaderLike;
  readonly sourceKey: string | (() => string);
}

/**
 * Reads exact indexed message offsets while retaining decompressed chunk
 * records by stable source and chunk identity.
 */
export function createMcapIndexedMessageReader({
  decompressHandlers,
  maxCacheSizeBytes = DEFAULT_INDEXED_DECOMPRESSED_CACHE_BYTES,
  readable,
  reader,
  sourceKey,
}: CreateMcapIndexedMessageReaderOptions): McapIndexedMessageReader {
  const capacityBytes = Math.max(1, Math.floor(maxCacheSizeBytes));
  const chunkIndexes = new Map<bigint, McapChunkIndex>(
    reader.chunkIndexes.map((chunk: McapChunkIndex) => [
      chunk.chunkStartOffset,
      chunk,
    ]),
  );
  const decompressedChunks = new LRUCache<string, Uint8Array>({
    maxSize: capacityBytes,
    sizeCalculation: (value) => Math.max(1, value.byteLength),
  });
  let activeSourceKey: string | undefined;

  const currentSourceKey = () =>
    typeof sourceKey === "function" ? sourceKey() : sourceKey;
  const activateSource = (nextSourceKey: string) => {
    if (activeSourceKey !== nextSourceKey) {
      decompressedChunks.clear();
      activeSourceKey = nextSourceKey;
    }
  };

  return async ({ entries, signal }) => {
    throwIfAborted(signal);
    activateSource(currentSourceKey());

    const entriesByChunk = new Map<bigint, McapIndexedMessageTime[]>();
    for (const entry of entries) {
      const selected = entriesByChunk.get(entry.chunkStartOffset) ?? [];
      selected.push(entry);
      entriesByChunk.set(entry.chunkStartOffset, selected);
    }

    const messagesByEntry = new Map<McapIndexedMessageTime, McapMessage>();
    for (const [chunkStartOffset, selected] of entriesByChunk) {
      throwIfAborted(signal);
      const chunk = chunkIndexes.get(chunkStartOffset);
      if (!chunk) {
        throw new Error(
          `Missing MCAP chunk index at ${chunkStartOffset.toString()}`,
        );
      }

      const records = await loadChunkRecords({
        activateSource,
        capacityBytes,
        chunk,
        currentSourceKey,
        decompressHandlers,
        decompressedChunks,
        readable,
        signal,
      });
      throwIfAborted(signal);

      for (const entry of selected) {
        throwIfAborted(signal);
        messagesByEntry.set(entry, parseIndexedMessage(records, entry));
      }
    }

    return entries.map((entry) => {
      const message = messagesByEntry.get(entry);
      if (!message) {
        throw new Error(
          `Missing MCAP message at indexed offset ${entry.messageOffset.toString()}`,
        );
      }
      return message;
    });
  };
}

async function loadChunkRecords({
  activateSource,
  capacityBytes,
  chunk,
  currentSourceKey,
  decompressHandlers,
  decompressedChunks,
  readable,
  signal,
}: {
  readonly activateSource: (sourceKey: string) => void;
  readonly capacityBytes: number;
  readonly chunk: McapChunkIndex;
  readonly currentSourceKey: () => string;
  readonly decompressHandlers: McapTypes.DecompressHandlers;
  readonly decompressedChunks: LRUCache<string, Uint8Array>;
  readonly readable: ByteClientReadable;
  readonly signal?: AbortSignal;
}): Promise<Uint8Array> {
  for (;;) {
    throwIfAborted(signal);
    const sourceKeyBeforeRead = currentSourceKey();
    activateSource(sourceKeyBeforeRead);
    const key = chunkCacheKey(sourceKeyBeforeRead, chunk);
    const cached = decompressedChunks.get(key);
    if (cached) {
      // A background validator probe can update source identity without an
      // await in this reader. Verify identity again before using cached bytes.
      if (currentSourceKey() === sourceKeyBeforeRead) {
        return cached;
      }
      continue;
    }

    const body = await readable.readContained(
      chunk.chunkStartOffset,
      chunk.chunkLength,
      { signal },
    );
    throwIfAborted(signal);
    const records = decompressChunkRecords(
      body.bytes,
      chunk,
      decompressHandlers,
    );
    throwIfAborted(signal);

    const sourceKeyAfterRead = currentSourceKey();
    if (sourceKeyAfterRead !== sourceKeyBeforeRead) {
      // The response discovered a different access/content identity. These
      // bytes can satisfy this read, but must not be admitted under the old
      // source key.
      activateSource(sourceKeyAfterRead);
      return records;
    }
    if (records.byteLength <= capacityBytes) {
      decompressedChunks.set(key, records);
    }
    return records;
  }
}

function chunkCacheKey(sourceKey: string, chunk: McapChunkIndex): string {
  return JSON.stringify([
    sourceKey,
    chunk.chunkStartOffset.toString(),
    chunk.chunkLength.toString(),
    chunk.compression,
    chunk.compressedSize.toString(),
    chunk.uncompressedSize.toString(),
    chunk.messageStartTime.toString(),
    chunk.messageEndTime.toString(),
  ]);
}

function decompressChunkRecords(
  bytes: Uint8Array,
  chunk: McapChunkIndex,
  handlers: McapTypes.DecompressHandlers,
): Uint8Array {
  const expectedChunkLength = safeNumber(chunk.chunkLength);
  if (
    bytes.byteLength !== expectedChunkLength ||
    bytes.byteLength < MIN_CHUNK_RECORD_BYTES
  ) {
    throw new Error(
      `MCAP Chunk byte length ${bytes.byteLength} did not match index length ${expectedChunkLength}`,
    );
  }

  const view = dataView(bytes);
  let offset = 0;
  if (view.getUint8(offset) !== MCAP_CHUNK_OPCODE) {
    throw new Error(
      `Expected MCAP Chunk record at ${chunk.chunkStartOffset.toString()}`,
    );
  }
  offset += 1;
  const recordLength = safeNumber(view.getBigUint64(offset, true));
  offset += 8;
  const recordEnd = offset + recordLength;
  if (recordEnd !== bytes.byteLength) {
    throw new Error("MCAP Chunk record length does not match source bytes");
  }

  const messageStartTime = view.getBigUint64(offset, true);
  offset += 8;
  const messageEndTime = view.getBigUint64(offset, true);
  offset += 8;
  const uncompressedSize = view.getBigUint64(offset, true);
  offset += 8;
  const uncompressedCrc = view.getUint32(offset, true);
  offset += 4;
  const compressionLength = view.getUint32(offset, true);
  offset += 4;
  const compressionEnd = offset + compressionLength;
  if (compressionEnd + 8 > recordEnd) {
    throw new Error("MCAP Chunk compression name exceeds record bounds");
  }
  const compression = textDecoder.decode(
    bytes.subarray(offset, compressionEnd),
  );
  offset = compressionEnd;
  const recordsLength = safeNumber(view.getBigUint64(offset, true));
  offset += 8;
  const recordsEnd = offset + recordsLength;
  if (recordsEnd !== recordEnd) {
    throw new Error("MCAP Chunk records length does not match record bounds");
  }
  if (
    messageStartTime !== chunk.messageStartTime ||
    messageEndTime !== chunk.messageEndTime ||
    compression !== chunk.compression ||
    uncompressedSize !== chunk.uncompressedSize ||
    BigInt(recordsLength) !== chunk.compressedSize
  ) {
    throw new Error("MCAP chunk index/data mismatch");
  }

  const encoded = bytes.subarray(offset, recordsEnd);
  const decompressed =
    compression.length === 0
      ? encoded.slice()
      : handlers[compression]?.(encoded, uncompressedSize);
  if (!decompressed) {
    throw new Error(`Unsupported MCAP chunk compression '${compression}'`);
  }
  const records =
    decompressed.byteOffset === 0 &&
    decompressed.byteLength === decompressed.buffer.byteLength
      ? decompressed
      : decompressed.slice();
  if (BigInt(records.byteLength) !== uncompressedSize) {
    throw new Error(
      `Expected ${uncompressedSize.toString()} decompressed bytes but received ${records.byteLength}`,
    );
  }
  if (uncompressedCrc !== 0 && crc32(records) !== uncompressedCrc) {
    throw new Error("Incorrect MCAP chunk CRC");
  }
  return records;
}

function parseIndexedMessage(
  records: Uint8Array,
  entry: McapIndexedMessageTime,
): McapMessage {
  if (entry.messageOffset < 0n) {
    throw new Error("MCAP indexed message offset cannot be negative");
  }
  const offset = safeNumber(entry.messageOffset);
  const view = dataView(records);
  if (
    offset + MCAP_RECORD_HEADER_BYTES > records.byteLength ||
    view.getUint8(offset) !== MCAP_MESSAGE_OPCODE
  ) {
    throw new Error(
      `Expected MCAP Message at indexed offset ${entry.messageOffset.toString()}`,
    );
  }
  const recordLength = safeNumber(view.getBigUint64(offset + 1, true));
  const contentOffset = offset + MCAP_RECORD_HEADER_BYTES;
  const recordEnd = contentOffset + recordLength;
  if (
    recordLength < MCAP_MESSAGE_PREFIX_BYTES ||
    recordEnd > records.byteLength
  ) {
    throw new Error("Indexed MCAP Message exceeds chunk bounds");
  }

  const channelId = view.getUint16(contentOffset, true);
  const sequence = view.getUint32(contentOffset + 2, true);
  const logTime = view.getBigUint64(contentOffset + 6, true);
  const publishTime = view.getBigUint64(contentOffset + 14, true);
  if (channelId !== entry.channelId || logTime !== entry.logTimeNs) {
    throw new Error("MCAP message index/data mismatch");
  }

  return {
    channelId,
    data: records.slice(contentOffset + MCAP_MESSAGE_PREFIX_BYTES, recordEnd),
    logTime,
    publishTime,
    sequence,
    type: "Message",
  };
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }
  const error = new Error("MCAP indexed message read aborted");
  error.name = "AbortError";
  throw error;
}
