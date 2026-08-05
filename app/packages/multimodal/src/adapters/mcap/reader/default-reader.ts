import "../compatibility/browser-node-globals";
import { McapIndexedReader, type McapTypes } from "@mcap/core";
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
import { createCachedMcapDecompressHandlers } from "./decompress-cache";
import { createMcapDecompressedChunkCache } from "./decompressed-chunk-cache";
import { createMcapIndexedMessageReader } from "./indexed-message-reader";
import { readLatestIndexedMessageTimesForReader } from "./latest-before";
import { readIndexedMessageTimesForReader } from "./message-index";
import { readTopicIndexedTimeBoundsForReader } from "./topic-time-bounds";
import type {
  McapIndexedReaderLike,
  McapReadIndexedMessageTimesRequest,
  McapReadLatestIndexedMessageTimesRequest,
  McapReadTopicIndexedTimeBoundsRequest,
} from "./types";

const DEFAULT_MCAP_MESSAGE_INDEX_CACHE_SIZE_BYTES = 128 * 1024 * 1024;

/**
 * Creates the default indexed MCAP reader with supported chunk decompressors.
 */
export async function createDefaultMcapReader(
  source: ByteSourceDescriptor,
  readable: McapTypes.IReadable,
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
  let reader: McapIndexedReader;
  try {
    reader = await McapIndexedReader.Initialize({
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

  const adapterReader: McapIndexedReaderLike = {
    channelsById: reader.channelsById,
    chunkIndexes: reader.chunkIndexes,
    dispose: () => decompressedChunkCache.dispose(),
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
    readIndexedMessageTimes: (args?: McapReadIndexedMessageTimesRequest) =>
      readIndexedMessageTimesForReader(reader, readable, args),
    readLatestIndexedMessageTimes: (
      args: McapReadLatestIndexedMessageTimesRequest,
    ) => readLatestIndexedMessageTimesForReader(reader, readable, args),
    readTopicIndexedTimeBounds: (args: McapReadTopicIndexedTimeBoundsRequest) =>
      readTopicIndexedTimeBoundsForReader(reader, readable, args),
    readMessages: reader.readMessages.bind(reader),
    schemasById: reader.schemasById,
    statistics: reader.statistics,
  };
  if (readable instanceof ByteClientReadable) {
    adapterReader.readBoundedMessages = createMcapBoundedReader({
      decompressedChunkCache,
      decompressHandlers: wasmDecompressHandlers,
      readable,
      reader: adapterReader,
      sourceKey: () => readable.sourceAccessKey(),
    });
    adapterReader.readIndexedMessages = createMcapIndexedMessageReader({
      decompressedChunkCache,
      decompressHandlers: wasmDecompressHandlers,
      readable,
      reader: adapterReader,
      sourceKey: () => readable.sourceAccessKey(),
    });
  }
  return adapterReader;
}

function compressedChunkTypes(reader: McapIndexedReader): ReadonlySet<string> {
  const chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][] =
    reader.chunkIndexes;

  return new Set(
    chunkIndexes
      .map((chunkIndex) => chunkIndex.compression)
      .filter((compression) => compression.length > 0),
  );
}

function assertSupportedChunkCompressions(
  compressions: ReadonlySet<string>,
  decompressHandlers: McapTypes.DecompressHandlers,
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

