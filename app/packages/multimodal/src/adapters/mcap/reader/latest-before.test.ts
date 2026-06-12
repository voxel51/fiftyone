import type { McapTypes } from "@mcap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readLatestIndexedMessageTimesForReader } from "./latest-before";
import type { McapIndexedReaderLike } from "./types";

const MCAP_MESSAGE_INDEX_OPCODE = 0x07;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readLatestIndexedMessageTimesForReader", () => {
  it("resolves the predecessor with exactly one footer read on ordered files", async () => {
    const oldIndex = createMessageIndexRecord(7, [[10n, 1n]]);
    const newIndex = createMessageIndexRecord(7, [[20n, 2n]]);
    const oldOffset = 64n;
    const newOffset = 256n;
    const { readable, reads } = createReadable([
      { bytes: oldIndex, offset: oldOffset },
      { bytes: newIndex, offset: newOffset },
    ]);
    const reader = createReader({
      chunkIndexes: [
        createChunkIndex({
          chunkStartOffset: 1_000n,
          messageEndTime: 10n,
          messageIndexLength: BigInt(oldIndex.byteLength),
          messageIndexOffsets: new Map([[7, oldOffset]]),
          messageStartTime: 10n,
        }),
        createChunkIndex({
          chunkStartOffset: 2_000n,
          messageEndTime: 20n,
          messageIndexLength: BigInt(newIndex.byteLength),
          messageIndexOffsets: new Map([[7, newOffset]]),
          messageStartTime: 20n,
        }),
      ],
    });

    const results = await readLatestIndexedMessageTimesForReader(
      reader,
      readable,
      { timeNs: 1_000n, topics: ["/camera"] }
    );

    expect(results.get("/camera")?.map((entry) => entry.logTimeNs)).toEqual([
      20n,
    ]);
    // The headline perf property: only the newest member chunk's footer
    // was read.
    expect(reads).toEqual([
      { offset: newOffset, size: BigInt(newIndex.byteLength) },
    ]);
  });

  it("skips chunks without the topic's channel with zero reads", async () => {
    const cameraIndex = createMessageIndexRecord(7, [[10n, 1n]]);
    const cameraOffset = 64n;
    const lidarIndex = createMessageIndexRecord(8, [[30n, 2n]]);
    const lidarOffset = 256n;
    const { readable, reads } = createReadable([
      { bytes: cameraIndex, offset: cameraOffset },
      { bytes: lidarIndex, offset: lidarOffset },
    ]);
    const reader = createReader({
      chunkIndexes: [
        createChunkIndex({
          chunkStartOffset: 1_000n,
          messageEndTime: 10n,
          messageIndexLength: BigInt(cameraIndex.byteLength),
          messageIndexOffsets: new Map([[7, cameraOffset]]),
          messageStartTime: 10n,
        }),
        // Newer chunk that only carries /lidar — membership comes from
        // the in-memory summary, so it must cost no I/O.
        createChunkIndex({
          chunkStartOffset: 2_000n,
          messageEndTime: 30n,
          messageIndexLength: BigInt(lidarIndex.byteLength),
          messageIndexOffsets: new Map([[8, lidarOffset]]),
          messageStartTime: 30n,
        }),
      ],
    });

    const results = await readLatestIndexedMessageTimesForReader(
      reader,
      readable,
      { timeNs: 100n, topics: ["/camera"] }
    );

    expect(results.get("/camera")?.map((entry) => entry.logTimeNs)).toEqual([
      10n,
    ]);
    expect(reads).toEqual([
      { offset: cameraOffset, size: BigInt(cameraIndex.byteLength) },
    ]);
  });

  it("walks past a member chunk whose entries are all after the bound", async () => {
    // Overlapping chunk: starts before t but every /camera entry in it
    // is after t — the walk must continue into the older chunk.
    const futureIndex = createMessageIndexRecord(7, [[90n, 9n]]);
    const pastIndex = createMessageIndexRecord(7, [[40n, 4n]]);
    const futureOffset = 64n;
    const pastOffset = 256n;
    const { readable } = createReadable([
      { bytes: futureIndex, offset: futureOffset },
      { bytes: pastIndex, offset: pastOffset },
    ]);
    const reader = createReader({
      chunkIndexes: [
        createChunkIndex({
          chunkStartOffset: 1_000n,
          messageEndTime: 100n,
          messageIndexLength: BigInt(futureIndex.byteLength),
          messageIndexOffsets: new Map([[7, futureOffset]]),
          messageStartTime: 30n,
        }),
        createChunkIndex({
          chunkStartOffset: 2_000n,
          messageEndTime: 45n,
          messageIndexLength: BigInt(pastIndex.byteLength),
          messageIndexOffsets: new Map([[7, pastOffset]]),
          messageStartTime: 40n,
        }),
      ],
    });

    const results = await readLatestIndexedMessageTimesForReader(
      reader,
      readable,
      { timeNs: 50n, topics: ["/camera"] }
    );

    expect(results.get("/camera")?.map((entry) => entry.logTimeNs)).toEqual([
      40n,
    ]);
  });

  it("picks the newest entry across overlapping unordered chunks", async () => {
    // The chunk with the later messageEndTime holds the OLDER qualifying
    // entry; the overlapping chunk walked second holds the winner.
    const firstIndex = createMessageIndexRecord(7, [
      [10n, 1n],
      [95n, 2n],
    ]);
    const secondIndex = createMessageIndexRecord(7, [[45n, 3n]]);
    const firstOffset = 64n;
    const secondOffset = 256n;
    const { readable } = createReadable([
      { bytes: firstIndex, offset: firstOffset },
      { bytes: secondIndex, offset: secondOffset },
    ]);
    const reader = createReader({
      chunkIndexes: [
        // Unordered input on purpose.
        createChunkIndex({
          chunkStartOffset: 2_000n,
          messageEndTime: 45n,
          messageIndexLength: BigInt(secondIndex.byteLength),
          messageIndexOffsets: new Map([[7, secondOffset]]),
          messageStartTime: 40n,
        }),
        createChunkIndex({
          chunkStartOffset: 1_000n,
          messageEndTime: 95n,
          messageIndexLength: BigInt(firstIndex.byteLength),
          messageIndexOffsets: new Map([[7, firstOffset]]),
          messageStartTime: 10n,
        }),
      ],
    });

    const results = await readLatestIndexedMessageTimesForReader(
      reader,
      readable,
      { timeNs: 50n, topics: ["/camera"] }
    );

    expect(results.get("/camera")?.map((entry) => entry.logTimeNs)).toEqual([
      45n,
    ]);
  });

  it("returns the newest N entries for a per-topic limit", async () => {
    const index = createMessageIndexRecord(7, [
      [10n, 1n],
      [20n, 2n],
      [30n, 3n],
    ]);
    const offset = 64n;
    const { readable } = createReadable([{ bytes: index, offset }]);
    const reader = createReader({
      chunkIndexes: [
        createChunkIndex({
          messageEndTime: 30n,
          messageIndexLength: BigInt(index.byteLength),
          messageIndexOffsets: new Map([[7, offset]]),
          messageStartTime: 10n,
        }),
      ],
    });

    const results = await readLatestIndexedMessageTimesForReader(
      reader,
      readable,
      { limitPerTopic: 2, timeNs: 100n, topics: ["/camera"] }
    );

    expect(results.get("/camera")?.map((entry) => entry.logTimeNs)).toEqual([
      20n,
      30n,
    ]);
  });

  it("returns empty for topics with no message at or before the bound", async () => {
    const index = createMessageIndexRecord(7, [[100n, 1n]]);
    const offset = 64n;
    const { readable, reads } = createReadable([{ bytes: index, offset }]);
    const reader = createReader({
      chunkIndexes: [
        createChunkIndex({
          messageEndTime: 100n,
          messageIndexLength: BigInt(index.byteLength),
          messageIndexOffsets: new Map([[7, offset]]),
          messageStartTime: 100n,
        }),
      ],
    });

    const results = await readLatestIndexedMessageTimesForReader(
      reader,
      readable,
      { timeNs: 50n, topics: ["/camera", "/lidar"] }
    );

    expect(results.get("/camera")).toEqual([]);
    expect(results.get("/lidar")).toEqual([]);
    // The only member chunk starts after the bound — no reads at all.
    expect(reads).toEqual([]);
  });

  it("stops at the probe cap and returns the best match so far", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const newIndex = createMessageIndexRecord(7, [[30n, 3n]]);
    const oldIndex = createMessageIndexRecord(7, [[10n, 1n]]);
    const newOffset = 64n;
    const oldOffset = 256n;
    const { readable, reads } = createReadable([
      { bytes: newIndex, offset: newOffset },
      { bytes: oldIndex, offset: oldOffset },
    ]);
    // Both chunks overlap the bound, so without the cap both would be read.
    const reader = createReader({
      chunkIndexes: [
        createChunkIndex({
          chunkStartOffset: 1_000n,
          messageEndTime: 90n,
          messageIndexLength: BigInt(newIndex.byteLength),
          messageIndexOffsets: new Map([[7, newOffset]]),
          messageStartTime: 5n,
        }),
        createChunkIndex({
          chunkStartOffset: 2_000n,
          messageEndTime: 80n,
          messageIndexLength: BigInt(oldIndex.byteLength),
          messageIndexOffsets: new Map([[7, oldOffset]]),
          messageStartTime: 5n,
        }),
      ],
    });

    const results = await readLatestIndexedMessageTimesForReader(
      reader,
      readable,
      { maxChunkProbesPerTopic: 1, timeNs: 50n, topics: ["/camera"] }
    );

    expect(results.get("/camera")?.map((entry) => entry.logTimeNs)).toEqual([
      30n,
    ]);
    expect(reads).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("rejects non-positive per-topic limits", async () => {
    const { readable } = createReadable([]);
    const reader = createReader({ chunkIndexes: [] });

    await expect(
      readLatestIndexedMessageTimesForReader(reader, readable, {
        limitPerTopic: 0,
        timeNs: 50n,
        topics: ["/camera"],
      })
    ).rejects.toThrow(
      "MCAP latest-message lookup requires a positive integer per-topic limit"
    );
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
  readonly reads: Array<{ readonly offset: bigint; readonly size: bigint }>;
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

  const reads: Array<{ readonly offset: bigint; readonly size: bigint }> = [];
  const readRange = vi.fn(async (offset: bigint, readSize: bigint) => {
    reads.push({ offset, size: readSize });
    return buffer.slice(Number(offset), Number(offset + readSize));
  });

  return {
    readable: {
      read: readRange,
      size: vi.fn(async () => BigInt(buffer.byteLength)),
    } as McapTypes.IReadable,
    reads,
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
