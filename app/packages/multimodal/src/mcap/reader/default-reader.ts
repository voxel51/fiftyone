import { McapIndexedReader, type McapTypes } from "@mcap/core";
import { loadMcapDecompressHandlers } from "../decompress/handlers";
import type { McapSourceDescriptor } from "../types";
import { readIndexedMessageTimesForReader } from "./message-index";
import type {
  McapIndexedReaderLike,
  McapInitializedReader,
  McapReadable,
} from "./types";

type DecompressHandlers = McapTypes.DecompressHandlers;

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
