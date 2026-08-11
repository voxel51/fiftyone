import "../compatibility/browser-node-globals";
import { McapIndexedReader, McapStreamReader } from "@mcap/core";
import {
  byteSourceAccessKey,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import { loadDecompressHandlers } from "../compatibility/mcap-support";
import { createMcapBoundedReader } from "./bounded-read";
import { ByteClientReadable } from "./byte-readable";
import {
  collectChunkDataPrefetchRanges,
  collectWindowPrefetchRanges,
  prefetchMcapByteRanges,
} from "./chunk-prefetch";
import type {
  McapPrefetchChunkDataRequest,
  McapPrefetchWindowRequest,
} from "./prefetch-types";
import {
  createCachedMcapDecompressHandlers,
  type McapDecompressHandlers,
} from "./decompress-cache";
import { createMcapDecompressedChunkCache } from "./decompressed-chunk-cache";
import { createMcapIndexedMessageReader } from "./indexed-message-reader";
import { readLatestIndexedMessageTimesForReader } from "./latest-before";
import { readIndexedMessageTimesForReader } from "./message-index";
import { readTopicIndexedTimeBoundsForReader } from "./topic-time-bounds";
import type {
  McapIndexedReaderLike,
  McapMessage,
  McapReadable,
  McapReadIndexedMessageTimesRequest,
  McapReadLatestIndexedMessageTimesRequest,
  McapReadTopicIndexedTimeBoundsRequest,
} from "./types";

const DEFAULT_MCAP_MESSAGE_INDEX_CACHE_SIZE_BYTES = 128 * 1024 * 1024;

type McapReadMessagesArgs = {
  readonly endTime?: bigint;
  readonly reverse?: boolean;
  readonly startTime?: bigint;
  readonly topics?: readonly string[];
  readonly validateCrcs?: boolean;
};

interface IndexedReaderConstructor {
  Initialize(options: {
    readonly decompressHandlers: McapDecompressHandlers;
    readonly messageIndexCacheSizeBytes: number;
    readonly readable: McapReadable;
  }): Promise<McapIndexedReaderLike>;
}

interface StreamReader {
  append(bytes: Uint8Array): void;
  done(): boolean;
  nextRecord(): unknown;
}

interface StreamReaderConstructor {
  new (options: {
    readonly decompressHandlers: McapDecompressHandlers;
    readonly validateCrcs?: boolean;
  }): StreamReader;
}

function indexedReaderConstructor(): IndexedReaderConstructor {
  const candidate: unknown = McapIndexedReader;
  if (!isIndexedReaderConstructor(candidate)) {
    throw new Error("@mcap/core did not expose McapIndexedReader.Initialize");
  }
  return candidate;
}

function streamReaderConstructor(): StreamReaderConstructor {
  const candidate: unknown = McapStreamReader;
  if (!isStreamReaderConstructor(candidate)) {
    throw new Error("@mcap/core did not expose McapStreamReader");
  }
  return candidate;
}

function isIndexedReaderConstructor(
  value: unknown,
): value is IndexedReaderConstructor {
  return (
    typeof value === "function" &&
    "Initialize" in value &&
    typeof value.Initialize === "function"
  );
}

function isStreamReaderConstructor(
  value: unknown,
): value is StreamReaderConstructor {
  return typeof value === "function";
}

/**
 * Creates the default indexed MCAP reader with supported chunk decompressors.
 */
export async function createDefaultMcapReader(
  source: ByteSourceDescriptor,
  readable: McapReadable,
): Promise<McapIndexedReaderLike> {
  const wasmDecompressHandlers = await loadDecompressHandlers();
  const decompressedChunkCache = createMcapDecompressedChunkCache();
  const decompressHandlers = createCachedMcapDecompressHandlers(
    wasmDecompressHandlers,
    {
      cache: decompressedChunkCache,
      ...(readable instanceof ByteClientReadable
        ? {}
        : { fallbackSourceKey: byteSourceAccessKey(source) }),
    },
  );
  let reader: McapIndexedReaderLike;
  try {
    reader = await indexedReaderConstructor().Initialize({
      decompressHandlers,
      messageIndexCacheSizeBytes: DEFAULT_MCAP_MESSAGE_INDEX_CACHE_SIZE_BYTES,
      readable,
    });
    if (readable instanceof ByteClientReadable) {
      readable.setChunkIndexes(reader.chunkIndexes);
    }
    assertSupportedChunkCompressions(
      compressedChunkTypes(reader),
      decompressHandlers,
    );
  } catch (error) {
    decompressedChunkCache.dispose();
    throw error;
  }

  const hasMessageIndexes =
    reader.chunkIndexes.length > 0 &&
    reader.chunkIndexes.every(
      (chunk) =>
        (chunk.messageStartTime === 0n && chunk.messageEndTime === 0n) ||
        (chunk.messageIndexLength > 0n && chunk.messageIndexOffsets.size > 0),
    );
  const adapterReader: McapIndexedReaderLike = {
    attachmentIndexes: reader.attachmentIndexes,
    channelsById: reader.channelsById,
    chunkIndexes: reader.chunkIndexes,
    dispose: () => decompressedChunkCache.dispose(),
    header: reader.header,
    metadataIndexes: reader.metadataIndexes,
    prefetchChunkData: (request: McapPrefetchChunkDataRequest) =>
      prefetchMcapByteRanges(
        readable,
        collectChunkDataPrefetchRanges({
          chunkIndexes: reader.chunkIndexes,
          request,
        }),
        request.maxConcurrentReads,
      ),
    prefetchWindow: (request: McapPrefetchWindowRequest) =>
      prefetchMcapByteRanges(
        readable,
        collectWindowPrefetchRanges({
          channelsById: reader.channelsById,
          chunkIndexes: reader.chunkIndexes,
          request,
        }),
        request.maxConcurrentReads,
      ),
    readMessages: hasMessageIndexes
      ? (args?: McapReadMessagesArgs) => reader.readMessages(args)
      : (args?: McapReadMessagesArgs) =>
          readNonIndexedMessages({
            args,
            channelsById: reader.channelsById,
            decompressHandlers,
            readable,
          }),
    schemasById: reader.schemasById,
    statistics: reader.statistics,
  };
  if (hasMessageIndexes) {
    adapterReader.readIndexedMessageTimes = (
      args?: McapReadIndexedMessageTimesRequest,
    ) => readIndexedMessageTimesForReader(reader, readable, args);
    adapterReader.readLatestIndexedMessageTimes = (
      args: McapReadLatestIndexedMessageTimesRequest,
    ) => readLatestIndexedMessageTimesForReader(reader, readable, args);
    adapterReader.readTopicIndexedTimeBounds = (
      args: McapReadTopicIndexedTimeBoundsRequest,
    ) => readTopicIndexedTimeBoundsForReader(reader, readable, args);
  }
  if (readable instanceof ByteClientReadable) {
    adapterReader.readBoundedMessages = createMcapBoundedReader({
      decompressedChunkCache,
      decompressHandlers: wasmDecompressHandlers,
      readable,
      reader: adapterReader,
      sourceKey: () => readable.sourceAccessKey(),
    });
    if (hasMessageIndexes) {
      adapterReader.readIndexedMessages = createMcapIndexedMessageReader({
        decompressedChunkCache,
        decompressHandlers: wasmDecompressHandlers,
        readable,
        reader: adapterReader,
        sourceKey: () => readable.sourceAccessKey(),
      });
    }
  }
  return adapterReader;
}

/**
 * Degraded reader for valid MCAP chunks that omit message indexes. The core
 * indexed reader cannot address those chunks, so scan the stream records and
 * apply the same topic/log-time filter locally. Memory stays bounded to the
 * parser buffer plus selected messages; repeated random reads may rescan.
 */
async function* readNonIndexedMessages({
  args = {},
  channelsById,
  decompressHandlers,
  readable,
}: {
  readonly args?: McapReadMessagesArgs;
  readonly channelsById: McapIndexedReaderLike["channelsById"];
  readonly decompressHandlers: McapDecompressHandlers;
  readonly readable: McapReadable;
}): AsyncGenerator<McapMessage, void, void> {
  const selectedChannelIds = args.topics
    ? new Set(
        [...channelsById.values()]
          .filter((channel) => args.topics?.includes(channel.topic))
          .map((channel) => channel.id),
      )
    : undefined;
  const messages: McapMessage[] = [];
  const stream = new (streamReaderConstructor())({
    decompressHandlers,
    ...(args.validateCrcs !== undefined
      ? { validateCrcs: args.validateCrcs }
      : {}),
  });
  const size = await readable.size();
  const chunkSize = 4n * 1024n * 1024n;
  for (let offset = 0n; offset < size; offset += chunkSize) {
    const readSize = offset + chunkSize < size ? chunkSize : size - offset;
    stream.append(await readable.read(offset, readSize));
    for (
      let record = stream.nextRecord();
      record;
      record = stream.nextRecord()
    ) {
      if (
        isMcapMessage(record) &&
        (selectedChannelIds?.has(record.channelId) ?? true) &&
        (args.startTime === undefined || record.logTime >= args.startTime) &&
        (args.endTime === undefined || record.logTime <= args.endTime)
      ) {
        messages.push(record);
      }
    }
  }
  if (!stream.done()) {
    throw new Error("Non-indexed MCAP scan ended before a complete footer");
  }
  messages.sort((left, right) =>
    left.logTime < right.logTime ? -1 : left.logTime > right.logTime ? 1 : 0,
  );
  if (args.reverse) {
    messages.reverse();
  }
  for (const message of messages) {
    yield message;
  }
}

function compressedChunkTypes(
  reader: McapIndexedReaderLike,
): ReadonlySet<string> {
  const chunkIndexes = reader.chunkIndexes;

  return new Set(
    chunkIndexes
      .map((chunkIndex) => chunkIndex.compression)
      .filter((compression) => compression.length > 0),
  );
}

function isMcapMessage(record: unknown): record is McapMessage {
  if (typeof record !== "object" || record === null) return false;
  if (!("type" in record) || record.type !== "Message") return false;
  return (
    "channelId" in record &&
    typeof record.channelId === "number" &&
    "data" in record &&
    record.data instanceof Uint8Array &&
    "logTime" in record &&
    typeof record.logTime === "bigint" &&
    "publishTime" in record &&
    typeof record.publishTime === "bigint" &&
    "sequence" in record &&
    typeof record.sequence === "number"
  );
}

function assertSupportedChunkCompressions(
  compressions: ReadonlySet<string>,
  decompressHandlers: McapDecompressHandlers,
) {
  const supported = new Set(Object.keys(decompressHandlers));
  const unsupported = [...compressions]
    .filter((compression) => !supported.has(compression))
    .sort();

  if (unsupported.length > 0) {
    const supportedList = [...supported].sort().join(", ");

    throw new Error(
      `Unsupported MCAP chunk compression: ${unsupported.join(
        ", ",
      )}. Supported compressions are ${supportedList}.`,
    );
  }
}
