import type { McapTypes } from "@mcap/core";
import { safeNumber } from "../../../query/bytes/bigint-utils";
import { throwIfAborted } from "../../../utils/cancellation";
import { yieldToTask } from "../../../utils/task-yield";
import { ByteClientReadable } from "./byte-readable";
import {
  decompressMcapChunkRecord,
  mcapDecompressedChunkKeyForIndex,
} from "./chunk-records";
import { type McapDecompressedChunkCache } from "./decompressed-chunk-cache";
import { MCAP_BOUNDED_GRANT_YIELD_INTERVAL } from "./consume-bounded-grant";
import type {
  McapIndexedMessageTime,
  McapIndexedReaderLike,
  McapReadIndexedMessagesRequest,
} from "./types";

const MCAP_MESSAGE_OPCODE = 0x05;
const MCAP_RECORD_HEADER_BYTES = 9;
const MCAP_MESSAGE_PREFIX_BYTES = 2 + 4 + 8 + 8;
const MCAP_INDEXED_READ_ABORT_MESSAGE = "MCAP indexed message read aborted";

type McapChunkIndex = McapTypes.TypedMcapRecords["ChunkIndex"];
type McapMessage = McapTypes.TypedMcapRecords["Message"];
type McapIndexedMessageReader = (
  request: McapReadIndexedMessagesRequest,
) => Promise<readonly McapMessage[]>;

/** Dependencies for one source-bound exact indexed-message reader. */
export interface CreateMcapIndexedMessageReaderOptions {
  /** Caller-owned and disposed with the containing reader. */
  readonly decompressedChunkCache: McapDecompressedChunkCache;
  readonly decompressHandlers: McapTypes.DecompressHandlers;
  readonly readable: ByteClientReadable;
  readonly reader: McapIndexedReaderLike;
  readonly sourceKey: string | (() => string);
  readonly taskYield?: () => Promise<void>;
}

/**
 * Reads exact indexed message offsets while retaining decompressed chunk
 * records by stable source and chunk identity.
 */
export function createMcapIndexedMessageReader({
  decompressedChunkCache,
  decompressHandlers,
  readable,
  reader,
  sourceKey,
  taskYield = yieldToTask,
}: CreateMcapIndexedMessageReaderOptions): McapIndexedMessageReader {
  const chunkIndexes = new Map<bigint, McapChunkIndex>(
    reader.chunkIndexes.map((chunk: McapChunkIndex) => [
      chunk.chunkStartOffset,
      chunk,
    ]),
  );
  const currentSourceKey = () =>
    typeof sourceKey === "function" ? sourceKey() : sourceKey;

  return async ({ entries, signal }) => {
    throwIfAborted(signal, MCAP_INDEXED_READ_ABORT_MESSAGE);
    decompressedChunkCache.activateSource(currentSourceKey());

    const entriesByChunk = new Map<bigint, McapIndexedMessageTime[]>();
    for (const entry of entries) {
      const selected = entriesByChunk.get(entry.chunkStartOffset) ?? [];
      selected.push(entry);
      entriesByChunk.set(entry.chunkStartOffset, selected);
    }

    const messagesByEntry = new Map<McapIndexedMessageTime, McapMessage>();
    let parsedEntries = 0;
    for (const [chunkStartOffset, selected] of entriesByChunk) {
      throwIfAborted(signal, MCAP_INDEXED_READ_ABORT_MESSAGE);
      const chunk = chunkIndexes.get(chunkStartOffset);
      if (!chunk) {
        throw new Error(
          `Missing MCAP chunk index at ${chunkStartOffset.toString()}`,
        );
      }

      const records = await loadChunkRecords({
        chunk,
        currentSourceKey,
        decompressedChunkCache,
        decompressHandlers,
        readable,
        signal,
      });
      throwIfAborted(signal, MCAP_INDEXED_READ_ABORT_MESSAGE);

      for (const entry of selected) {
        if (
          parsedEntries > 0 &&
          parsedEntries % MCAP_BOUNDED_GRANT_YIELD_INTERVAL === 0
        ) {
          await taskYield();
        }
        throwIfAborted(signal, MCAP_INDEXED_READ_ABORT_MESSAGE);
        messagesByEntry.set(entry, parseMcapIndexedMessage(records, entry));
        parsedEntries += 1;
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
  chunk,
  currentSourceKey,
  decompressedChunkCache,
  decompressHandlers,
  readable,
  signal,
}: {
  readonly chunk: McapChunkIndex;
  readonly currentSourceKey: () => string;
  readonly decompressedChunkCache: McapDecompressedChunkCache;
  readonly decompressHandlers: McapTypes.DecompressHandlers;
  readonly readable: ByteClientReadable;
  readonly signal?: AbortSignal;
}): Promise<Uint8Array> {
  throwIfAborted(signal, MCAP_INDEXED_READ_ABORT_MESSAGE);
  const beforeReadKey = mcapDecompressedChunkKeyForIndex(
    currentSourceKey(),
    chunk,
  );
  const cached = decompressedChunkCache.get(beforeReadKey);
  if (cached) {
    return cached.bytes;
  }

  const body = await readable.readContained(
    chunk.chunkStartOffset,
    chunk.chunkLength,
    { signal },
  );
  throwIfAborted(signal, MCAP_INDEXED_READ_ABORT_MESSAGE);
  const result = decompressedChunkCache.getOrLoad(
    mcapDecompressedChunkKeyForIndex(currentSourceKey(), chunk),
    () => decompressMcapChunkRecord(body.bytes, chunk, decompressHandlers),
  );
  throwIfAborted(signal, MCAP_INDEXED_READ_ABORT_MESSAGE);
  return result.bytes;
}

export function parseMcapIndexedMessage(
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
