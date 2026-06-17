import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import { readTopicIndexedTimeBoundsForReader } from "./topic-time-bounds";
import type { McapIndexedReaderLike } from "./types";

const MCAP_MESSAGE_INDEX_OPCODE = 0x07;

describe("readTopicIndexedTimeBoundsForReader", () => {
  it("resolves first and last times across overlapping chunks", async () => {
    // The chunk with the wider span holds neither extreme: the earliest
    // entry lives in the second chunk, the latest in the first.
    const wideIndex = createMessageIndexRecord(7, [
      [20n, 1n],
      [80n, 2n],
    ]);
    const earlyIndex = createMessageIndexRecord(7, [[10n, 3n]]);
    const wideOffset = 64n;
    const earlyOffset = 256n;
    const { readable } = createReadable([
      { bytes: wideIndex, offset: wideOffset },
      { bytes: earlyIndex, offset: earlyOffset },
    ]);
    const reader = createReader({
      chunkIndexes: [
        createChunkIndex({
          chunkStartOffset: 1_000n,
          messageEndTime: 90n,
          messageIndexLength: BigInt(wideIndex.byteLength),
          messageIndexOffsets: new Map([[7, wideOffset]]),
          messageStartTime: 5n,
        }),
        createChunkIndex({
          chunkStartOffset: 2_000n,
          messageEndTime: 15n,
          messageIndexLength: BigInt(earlyIndex.byteLength),
          messageIndexOffsets: new Map([[7, earlyOffset]]),
          messageStartTime: 8n,
        }),
      ],
    });

    const results = await readTopicIndexedTimeBoundsForReader(
      reader,
      readable,
      { topics: ["/camera"] }
    );

    expect(results.get("/camera")).toEqual({
      firstLogTimeNs: 10n,
      lastLogTimeNs: 80n,
    });
  });

  it("maps topics without indexed messages to null", async () => {
    const cameraIndex = createMessageIndexRecord(7, [[10n, 1n]]);
    const offset = 64n;
    const { readable } = createReadable([{ bytes: cameraIndex, offset }]);
    const reader = createReader({
      chunkIndexes: [
        createChunkIndex({
          messageEndTime: 10n,
          messageIndexLength: BigInt(cameraIndex.byteLength),
          messageIndexOffsets: new Map([[7, offset]]),
          messageStartTime: 10n,
        }),
      ],
    });

    const results = await readTopicIndexedTimeBoundsForReader(
      reader,
      readable,
      { topics: ["/camera", "/lidar", "/unknown"] }
    );

    expect(results.get("/camera")).toEqual({
      firstLogTimeNs: 10n,
      lastLogTimeNs: 10n,
    });
    // Known channel with no member chunks, and a topic with no channel.
    expect(results.get("/lidar")).toBeNull();
    expect(results.get("/unknown")).toBeNull();
  });

  it("rejects oversized topic requests", async () => {
    const { readable } = createReadable([]);
    const reader = createReader({ chunkIndexes: [] });
    const topics = Array.from({ length: 129 }, (_, i) => `/topic-${i}`);

    await expect(
      readTopicIndexedTimeBoundsForReader(reader, readable, { topics })
    ).rejects.toThrow(
      "MCAP topic time bounds support at most 128 topics per request"
    );
  });

  it("rejects invalid max chunk probe caps", async () => {
    const { readable } = createReadable([]);
    const reader = createReader({ chunkIndexes: [] });
    const topics = ["/camera"];

    for (const maxChunkProbesPerTopic of [0, -1, 1.5, Number.NaN]) {
      await expect(
        readTopicIndexedTimeBoundsForReader(reader, readable, {
          maxChunkProbesPerTopic,
          topics,
        })
      ).rejects.toThrow(
        "MCAP topic time-bounds lookup requires a positive integer maxChunkProbesPerTopic"
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Fixtures (mirrors reader.test.ts)
// ---------------------------------------------------------------------------

function createReader({
  chunkIndexes,
}: {
  readonly chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][];
}): McapIndexedReaderLike {
  return {
    channelsById: new Map([
      [7, createChannel({ id: 7, topic: "/camera" })],
      [8, createChannel({ id: 8, topic: "/lidar" })],
    ]),
    chunkIndexes,
    readMessages: vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    }),
    schemasById: new Map(),
  };
}

function createReadable(
  chunks: readonly {
    readonly bytes: Uint8Array;
    readonly offset: bigint;
  }[]
): {
  readonly readable: McapTypes.IReadable;
} {
  const size = chunks.reduce(
    (max, chunk) =>
      Math.max(max, Number(chunk.offset) + chunk.bytes.byteLength),
    0
  );
  const buffer = new Uint8Array(size);
  for (const chunk of chunks) {
    buffer.set(chunk.bytes, Number(chunk.offset));
  }

  return {
    readable: {
      read: vi.fn(async (offset: bigint, readSize: bigint) =>
        buffer.slice(Number(offset), Number(offset + readSize))
      ),
      size: vi.fn(async () => BigInt(buffer.byteLength)),
    } as McapTypes.IReadable,
  };
}

function createMessageIndexRecord(
  channelId: number,
  records: readonly (readonly [logTimeNs: bigint, messageOffset: bigint])[]
): Uint8Array {
  const contentLength = 2 + 4 + records.length * 16;
  const bytes = new Uint8Array(1 + 8 + contentLength);
  const view = new DataView(bytes.buffer);

  view.setUint8(0, MCAP_MESSAGE_INDEX_OPCODE);
  view.setBigUint64(1, BigInt(contentLength), true);
  view.setUint16(9, channelId, true);
  view.setUint32(11, records.length * 16, true);

  let offset = 15;
  for (const [logTimeNs, messageOffset] of records) {
    view.setBigUint64(offset, logTimeNs, true);
    view.setBigUint64(offset + 8, messageOffset, true);
    offset += 16;
  }

  return bytes;
}

function createChunkIndex(
  options: Partial<McapTypes.TypedMcapRecords["ChunkIndex"]> = {}
): McapTypes.TypedMcapRecords["ChunkIndex"] {
  return {
    chunkLength: options.chunkLength ?? 256n,
    chunkStartOffset: options.chunkStartOffset ?? 1_000n,
    compressedSize: options.compressedSize ?? 0n,
    compression: options.compression ?? "",
    messageEndTime: options.messageEndTime ?? 20n,
    messageIndexLength: options.messageIndexLength ?? 0n,
    messageIndexOffsets: options.messageIndexOffsets ?? new Map(),
    messageStartTime: options.messageStartTime ?? 10n,
    type: "ChunkIndex",
    uncompressedSize: options.uncompressedSize ?? 0n,
  };
}

function createChannel(
  options: Partial<McapTypes.TypedMcapRecords["Channel"]> = {}
): McapTypes.TypedMcapRecords["Channel"] {
  return {
    id: options.id ?? 7,
    messageEncoding: "protobuf",
    metadata: new Map(),
    schemaId: 3,
    topic: options.topic ?? "/topic",
    type: "Channel",
  };
}
