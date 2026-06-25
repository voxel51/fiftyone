import "../browser-node-globals";
import { McapIndexedReader, type McapTypes } from "@mcap/core";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { loadDecompressHandlers } from "../mcap-support";
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
  _source: ByteSourceDescriptor,
  readable: McapTypes.IReadable,
): Promise<McapIndexedReaderLike> {
  const wasmDecompressHandlers = await loadDecompressHandlers();
  const reader = await McapIndexedReader.Initialize({
    decompressHandlers: wasmDecompressHandlers,
    messageIndexCacheSizeBytes: DEFAULT_MCAP_MESSAGE_INDEX_CACHE_SIZE_BYTES,
    readable,
  });
  const chunkCompressions = compressedChunkTypes(reader);
  assertSupportedChunkCompressions(chunkCompressions, wasmDecompressHandlers);

  return {
    channelsById: reader.channelsById,
    chunkIndexes: reader.chunkIndexes,
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
