import { describe, expect, it, vi } from "vitest";
import type {
  ByteClient,
  ByteRangeReadRequest,
  ByteSourceDescriptor,
} from "../../query/bytes";
import { prewarmMcapSource } from "./prewarm-mcap-source";
import type {
  McapChannel,
  McapChunkIndex,
  McapIndexedReaderLike,
} from "./reader";

describe("prewarmMcapSource", () => {
  it("warms the startup window's message indexes and chunk data", async () => {
    const { byteClient, reads } = createRecordingByteClient();

    await prewarmMcapSource(createSource(), {
      byteClient,
      readerFactory: () =>
        Promise.resolve(
          createReader({
            chunkIndexes: [
              createChunkIndex({
                chunkLength: 100n,
                chunkStartOffset: 1_000n,
                messageEndTime: 20n,
                messageIndexLength: 16n,
                messageIndexOffsets: new Map([[7, 1_100n]]),
                messageStartTime: 10n,
              }),
              // Beyond the startup window from statistics.messageStartTime.
              createChunkIndex({
                chunkLength: 100n,
                chunkStartOffset: 9_000n,
                messageEndTime: 5_000_000_020n,
                messageIndexLength: 16n,
                messageIndexOffsets: new Map([[7, 9_100n]]),
                messageStartTime: 5_000_000_010n,
              }),
            ],
            statistics: createStatistics(10n),
          }),
        ),
    });

    expect(reads).toEqual([
      { length: 16n, offset: 1_100n },
      { length: 100n, offset: 1_000n },
    ]);
  });

  it("caps warmed ranges to the byte budget, keeping earliest chunks", async () => {
    const { byteClient, reads } = createRecordingByteClient();

    await prewarmMcapSource(createSource(), {
      byteClient,
      maxBytes: 140n,
      readerFactory: () =>
        Promise.resolve(
          createReader({
            chunkIndexes: [
              createChunkIndex({
                chunkLength: 100n,
                chunkStartOffset: 1_000n,
                messageEndTime: 20n,
                messageIndexLength: 16n,
                messageIndexOffsets: new Map([[7, 1_100n]]),
                messageStartTime: 10n,
              }),
              createChunkIndex({
                chunkLength: 100n,
                chunkStartOffset: 2_000n,
                messageEndTime: 40n,
                messageIndexLength: 16n,
                messageIndexOffsets: new Map([[7, 2_100n]]),
                messageStartTime: 30n,
              }),
            ],
            statistics: createStatistics(10n),
          }),
        ),
    });

    // Both message-index regions and the first chunk fit in 140 bytes; the
    // second chunk would overflow the budget, and warming stops there
    // because chunks are only useful in consumption order.
    expect(reads).toEqual([
      { length: 16n, offset: 1_100n },
      { length: 16n, offset: 2_100n },
      { length: 100n, offset: 1_000n },
    ]);
  });

  it("stops without reads when the signal is already aborted", async () => {
    const { byteClient, reads } = createRecordingByteClient();
    const abort = new AbortController();
    abort.abort();

    await prewarmMcapSource(createSource(), {
      byteClient,
      readerFactory: () =>
        Promise.resolve(
          createReader({
            chunkIndexes: [
              createChunkIndex({
                chunkLength: 100n,
                chunkStartOffset: 1_000n,
                messageIndexLength: 16n,
                messageIndexOffsets: new Map([[7, 1_100n]]),
              }),
            ],
            statistics: createStatistics(10n),
          }),
        ),
      signal: abort.signal,
    });

    expect(reads).toEqual([]);
  });
});

function createSource(): ByteSourceDescriptor {
  return {
    sizeBytes: "1000000",
    sourceId: "sample-1",
    url: "memory://sample-1.mcap",
  };
}

function createRecordingByteClient(): {
  byteClient: ByteClient;
  reads: { length: bigint; offset: bigint }[];
} {
  const reads: { length: bigint; offset: bigint }[] = [];

  return {
    byteClient: {
      readBytes: vi.fn((request: ByteRangeReadRequest) => {
        reads.push({
          length: request.range.length,
          offset: request.range.offset,
        });
        return Promise.resolve({
          bytes: new Uint8Array(Number(request.range.length)),
          range: request.range,
          source: request.source,
        });
      }),
    },
    reads,
  };
}

function createReader(options: {
  chunkIndexes: readonly McapChunkIndex[];
  statistics?: McapIndexedReaderLike["statistics"];
}): McapIndexedReaderLike {
  return {
    channelsById: new Map([[7, createChannel()]]),
    chunkIndexes: options.chunkIndexes,
    readMessages: async function* () {
      for await (const message of []) yield message;
    },
    schemasById: new Map(),
    statistics: options.statistics,
  };
}

function createStatistics(
  messageStartTime: bigint,
): McapIndexedReaderLike["statistics"] {
  return {
    attachmentCount: 0,
    channelCount: 1,
    channelMessageCounts: new Map(),
    chunkCount: 1,
    messageCount: 1n,
    messageEndTime: messageStartTime + 100n,
    messageStartTime,
    metadataCount: 0,
    schemaCount: 1,
    type: "Statistics",
  };
}

function createChunkIndex(
  options: Partial<McapChunkIndex> = {},
): McapChunkIndex {
  return {
    chunkLength: options.chunkLength ?? 256n,
    chunkStartOffset: options.chunkStartOffset ?? 1_000n,
    compressedSize: options.compressedSize ?? 0n,
    compression: options.compression ?? "",
    messageEndTime: options.messageEndTime ?? 20n,
    messageIndexLength: options.messageIndexLength ?? 0n,
    messageIndexOffsets:
      options.messageIndexOffsets ?? new Map<number, bigint>(),
    messageStartTime: options.messageStartTime ?? 10n,
    type: "ChunkIndex",
    uncompressedSize: options.uncompressedSize ?? 0n,
  };
}

function createChannel(): McapChannel {
  return {
    id: 7,
    messageEncoding: "protobuf",
    metadata: new Map(),
    schemaId: 3,
    topic: "/camera",
    type: "Channel",
  };
}
