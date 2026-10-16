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
      { topics: ["/camera"] },
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
      { topics: ["/camera", "/lidar", "/unknown"] },
    );

    expect(results.get("/camera")).toEqual({
      firstLogTimeNs: 10n,
      lastLogTimeNs: 10n,
    });
    // Known channel with no member chunks, and a topic with no channel.
    expect(results.get("/lidar")).toBeNull();
    expect(results.get("/unknown")).toBeNull();
  });

  it("coalesces topics in one chunk and reuses first/last reads only within a lookup", async () => {
    const chunk = indexedChunk(64n, 0n, 100n, [
      [7, [80n, 10n, 30n]],
      [8, [60n, 20n]],
    ]);
    const { readable } = createReadable(chunk.records);
    const reader = createReader({ chunkIndexes: [chunk.index] });
    const request = { topics: ["/camera", "/lidar"] };
    const expected = new Map([
      ["/camera", { firstLogTimeNs: 10n, lastLogTimeNs: 80n }],
      ["/lidar", { firstLogTimeNs: 20n, lastLogTimeNs: 60n }],
    ]);
    expect(
      await readTopicIndexedTimeBoundsForReader(reader, readable, request),
    ).toEqual(expected);
    expect(readable.read).toHaveBeenCalledTimes(1);
    expect(readable.read).toHaveBeenCalledWith(
      64n,
      chunk.index.messageIndexLength,
    );
    expect(
      await readTopicIndexedTimeBoundsForReader(reader, readable, request),
    ).toEqual(expected);
    expect(readable.read).toHaveBeenCalledTimes(2);
  });

  it("keeps overlapping topic walks independent and skips channels after their bounds settle", async () => {
    const first = indexedChunk(64n, 0n, 100n, [
      [7, [0n, 100n]],
      [8, [40n, 60n]],
    ]);
    // The camera's first and last bounds are already definitive; its corrupt
    // record in the overlapping chunk must never be parsed or requested.
    const overlap = indexedChunk(256n, 10n, 90n, [
      [7, [50n]],
      [8, [20n, 80n]],
    ]);
    overlap.records[0].bytes[0] = 0xff;
    const { readable } = createReadable([...first.records, ...overlap.records]);
    const reader = createReader({ chunkIndexes: [overlap.index, first.index] });
    const result = await readTopicIndexedTimeBoundsForReader(reader, readable, {
      topics: ["/camera", "/lidar"],
    });
    expect(result.get("/camera")).toEqual({
      firstLogTimeNs: 0n,
      lastLogTimeNs: 100n,
    });
    expect(result.get("/lidar")).toEqual({
      firstLogTimeNs: 20n,
      lastLogTimeNs: 80n,
    });
    expect(readable.read).toHaveBeenCalledTimes(2);
    expect(readable.read).toHaveBeenNthCalledWith(
      2,
      overlap.records[1].offset,
      BigInt(overlap.records[1].bytes.length),
    );
  });

  it("preserves per-topic probe caps with overlapping chunks", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const first = indexedChunk(64n, 0n, 100n, [
        [7, [30n, 70n]],
        [8, [40n, 60n]],
      ]);
      const overlap = indexedChunk(256n, 10n, 90n, [
        [7, [20n, 80n]],
        [8, [20n, 80n]],
      ]);
      const { readable } = createReadable([
        ...first.records,
        ...overlap.records,
      ]);
      const result = await readTopicIndexedTimeBoundsForReader(
        createReader({ chunkIndexes: [first.index, overlap.index] }),
        readable,
        {
          topics: ["/camera", "/lidar"],
          maxChunkProbesPerTopic: 1,
        },
      );
      expect(result.get("/camera")).toEqual({
        firstLogTimeNs: 30n,
        lastLogTimeNs: 70n,
      });
      expect(result.get("/lidar")).toEqual({
        firstLogTimeNs: 40n,
        lastLogTimeNs: 60n,
      });
      expect(readable.read).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(4);
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps sparse indexes and individually oversized records in separate reads", async () => {
    const chunk = indexedChunk(64n, 0n, 100n, [
      [7, [10n]],
      [9, Array.from({ length: 5000 }, () => 50n)],
      [8, [90n]],
    ]);
    const { readable } = createReadable(chunk.records);
    const reader = createReader({ chunkIndexes: [chunk.index] });
    const result = await readTopicIndexedTimeBoundsForReader(reader, readable, {
      topics: ["/camera", "/lidar"],
    });
    expect(result.get("/lidar")).toEqual({
      firstLogTimeNs: 90n,
      lastLogTimeNs: 90n,
    });
    expect(readable.read).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(readable.read).mock.calls)
      expect(call[1]).toBe(31n);

    // The 64 KiB threshold is a coalescing bound, not a ban on a larger
    // single valid MessageIndex. Selecting that channel still reads it.
    const withLargeChannel = {
      ...reader,
      channelsById: new Map([
        ...reader.channelsById,
        [9, createChannel({ id: 9, topic: "/large" })] as const,
      ]),
    };
    expect(
      (
        await readTopicIndexedTimeBoundsForReader(withLargeChannel, readable, {
          topics: ["/large"],
        })
      ).get("/large"),
    ).toEqual({ firstLogTimeNs: 50n, lastLogTimeNs: 50n });
    expect(readable.read).toHaveBeenLastCalledWith(
      chunk.records[1].offset,
      BigInt(chunk.records[1].bytes.length),
    );
  });

  it("combines channels on the same topic and handles empty indexes", async () => {
    const chunk = indexedChunk(64n, 0n, 100n, [
      [7, []],
      [8, [30n]],
      [9, [10n, 90n]],
    ]);
    const { readable } = createReadable(chunk.records);
    const reader = createReader({ chunkIndexes: [chunk.index] });
    const withSecondCamera = {
      ...reader,
      channelsById: new Map([
        ...reader.channelsById,
        [9, createChannel({ id: 9, topic: "/camera" })] as const,
      ]),
    };
    const results = await readTopicIndexedTimeBoundsForReader(
      withSecondCamera,
      readable,
      { topics: ["/unknown", "/camera", "/lidar"] },
    );
    expect([...results.keys()]).toEqual(["/unknown", "/camera", "/lidar"]);
    expect(results.get("/camera")).toEqual({
      firstLogTimeNs: 10n,
      lastLogTimeNs: 90n,
    });
    expect(readable.read).toHaveBeenCalledTimes(1);
    expect(
      (
        await readTopicIndexedTimeBoundsForReader(reader, readable, {
          topics: ["/camera"],
        })
      ).get("/camera"),
    ).toBeNull();
  });

  it("rejects corrupt selected indexes and stops exact reads on cancellation", async () => {
    const first = indexedChunk(64n, 0n, 10n, [[7, [0n]]]);
    const last = indexedChunk(256n, 90n, 100n, [[7, [100n]]]);
    const { readable } = createReadable([...first.records, ...last.records]);
    const reader = createReader({ chunkIndexes: [first.index, last.index] });
    const cancelled = new DOMException("cancelled", "AbortError");
    const readExact = vi.fn(async () => {
      throw cancelled;
    });
    await expect(
      readTopicIndexedTimeBoundsForReader(
        reader,
        { ...readable, readExact },
        { topics: ["/camera"] },
      ),
    ).rejects.toBe(cancelled);
    expect(readExact).toHaveBeenCalledTimes(1);
    expect(readable.read).not.toHaveBeenCalled();

    first.records[0].bytes[9] = 8; // mismatched channel ID
    const corrupt = createReadable(first.records).readable;
    await expect(
      readTopicIndexedTimeBoundsForReader(
        createReader({ chunkIndexes: [first.index] }),
        corrupt,
        { topics: ["/camera"] },
      ),
    ).rejects.toThrow("did not match expected channel 7");
  });

  it("rejects oversized topic requests", async () => {
    const { readable } = createReadable([]);
    const reader = createReader({ chunkIndexes: [] });
    const topics = Array.from({ length: 129 }, (_, i) => `/topic-${i}`);

    await expect(
      readTopicIndexedTimeBoundsForReader(reader, readable, { topics }),
    ).rejects.toThrow(
      "MCAP topic time bounds support at most 128 topics per request",
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
        }),
      ).rejects.toThrow(
        "MCAP topic time-bounds lookup requires a positive integer maxChunkProbesPerTopic",
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
  }[],
): {
  readonly readable: McapTypes.IReadable;
} {
  const size = chunks.reduce(
    (max, chunk) =>
      Math.max(max, Number(chunk.offset) + chunk.bytes.byteLength),
    0,
  );
  const buffer = new Uint8Array(size);
  for (const chunk of chunks) {
    buffer.set(chunk.bytes, Number(chunk.offset));
  }

  return {
    readable: {
      read: vi.fn(async (offset: bigint, readSize: bigint) =>
        buffer.slice(Number(offset), Number(offset + readSize)),
      ),
      size: vi.fn(async () => BigInt(buffer.byteLength)),
    } as McapTypes.IReadable,
  };
}

function createMessageIndexRecord(
  channelId: number,
  records: readonly (readonly [logTimeNs: bigint, messageOffset: bigint])[],
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
  options: Partial<McapTypes.TypedMcapRecords["ChunkIndex"]> = {},
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
  options: Partial<McapTypes.TypedMcapRecords["Channel"]> = {},
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

function indexedChunk(
  offset: bigint,
  start: bigint,
  end: bigint,
  channels: readonly (readonly [number, readonly bigint[]])[],
) {
  let nextOffset = offset;
  const offsets = new Map<number, bigint>();
  const records = channels.map(([id, times]) => {
    const bytes = createMessageIndexRecord(
      id,
      times.map((time, index) => [time, BigInt(index)] as const),
    );
    const record = { bytes, offset: nextOffset };
    offsets.set(id, nextOffset);
    nextOffset += BigInt(bytes.length);
    return record;
  });
  return {
    records,
    index: createChunkIndex({
      chunkStartOffset: offset - 32n,
      messageStartTime: start,
      messageEndTime: end,
      messageIndexOffsets: offsets,
      messageIndexLength: nextOffset - offset,
    }),
  };
}
