import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import {
  collectChunkDataPrefetchRanges,
  collectWindowPrefetchRanges,
  prefetchMcapByteRanges,
  type McapPrefetchByteRange,
} from "./chunk-prefetch";

describe("collectWindowPrefetchRanges", () => {
  it("collects message-index regions before chunk data in time order", () => {
    const ranges = collectWindowPrefetchRanges({
      channelsById: createChannels(),
      chunkIndexes: [
        createChunkIndex({
          chunkLength: 100n,
          chunkStartOffset: 2_000n,
          messageEndTime: 40n,
          messageIndexLength: 32n,
          messageIndexOffsets: new Map([[7, 2_100n]]),
          messageStartTime: 30n,
        }),
        createChunkIndex({
          chunkLength: 100n,
          chunkStartOffset: 1_000n,
          messageEndTime: 20n,
          messageIndexLength: 16n,
          messageIndexOffsets: new Map([[7, 1_100n]]),
          messageStartTime: 10n,
        }),
      ],
      request: { endTimeNs: 100n, startTimeNs: 0n, topics: ["/camera"] },
    });

    expect(ranges).toEqual([
      { length: 16n, offset: 1_100n },
      { length: 32n, offset: 2_100n },
      { length: 100n, offset: 1_000n },
      { length: 100n, offset: 2_000n },
    ]);
  });

  it("skips chunks outside the window and chunks without requested channels", () => {
    const ranges = collectWindowPrefetchRanges({
      channelsById: createChannels(),
      chunkIndexes: [
        // Before the window.
        createChunkIndex({
          chunkStartOffset: 1_000n,
          messageEndTime: 9n,
          messageIndexOffsets: new Map([[7, 1_100n]]),
          messageIndexLength: 16n,
          messageStartTime: 5n,
        }),
        // Carries only the /lidar channel.
        createChunkIndex({
          chunkStartOffset: 2_000n,
          messageEndTime: 20n,
          messageIndexOffsets: new Map([[8, 2_100n]]),
          messageIndexLength: 16n,
          messageStartTime: 12n,
        }),
        // Relevant.
        createChunkIndex({
          chunkLength: 64n,
          chunkStartOffset: 3_000n,
          messageEndTime: 30n,
          messageIndexOffsets: new Map([[7, 3_100n]]),
          messageIndexLength: 16n,
          messageStartTime: 25n,
        }),
        // After the window.
        createChunkIndex({
          chunkStartOffset: 4_000n,
          messageEndTime: 60n,
          messageIndexOffsets: new Map([[7, 4_100n]]),
          messageIndexLength: 16n,
          messageStartTime: 51n,
        }),
      ],
      request: { endTimeNs: 50n, startTimeNs: 10n, topics: ["/camera"] },
    });

    expect(ranges).toEqual([
      { length: 16n, offset: 3_100n },
      { length: 64n, offset: 3_000n },
    ]);
  });

  it("omits chunk data when includeChunkData is false", () => {
    const ranges = collectWindowPrefetchRanges({
      channelsById: createChannels(),
      chunkIndexes: [
        createChunkIndex({
          chunkStartOffset: 1_000n,
          messageIndexLength: 16n,
          messageIndexOffsets: new Map([[7, 1_100n]]),
        }),
      ],
      request: { includeChunkData: false, topics: ["/camera"] },
    });

    expect(ranges).toEqual([{ length: 16n, offset: 1_100n }]);
  });

  it("caps the chunk count keeping the earliest chunks", () => {
    const chunkIndexes = [30n, 10n, 20n].map((startTime, index) =>
      createChunkIndex({
        chunkStartOffset: BigInt(index + 1) * 1_000n,
        messageEndTime: startTime + 5n,
        messageIndexLength: 16n,
        messageIndexOffsets: new Map([[7, BigInt(index + 1) * 1_000n + 100n]]),
        messageStartTime: startTime,
      }),
    );

    const ranges = collectWindowPrefetchRanges({
      channelsById: createChannels(),
      chunkIndexes,
      request: { maxChunks: 2, topics: ["/camera"] },
    });

    // Earliest two chunks by message start time: 10n and 20n.
    expect(ranges.map((range) => range.offset)).toEqual([
      2_100n,
      3_100n,
      2_000n,
      3_000n,
    ]);
  });

  it("returns nothing when no requested topic maps to a channel", () => {
    const ranges = collectWindowPrefetchRanges({
      channelsById: createChannels(),
      chunkIndexes: [createChunkIndex({})],
      request: { topics: ["/unknown"] },
    });

    expect(ranges).toEqual([]);
  });

  it("keeps chunks without message-index offsets as data-only candidates", () => {
    const ranges = collectWindowPrefetchRanges({
      channelsById: createChannels(),
      chunkIndexes: [
        createChunkIndex({
          chunkLength: 48n,
          chunkStartOffset: 1_000n,
          messageIndexLength: 0n,
          messageIndexOffsets: new Map(),
        }),
      ],
      request: { topics: ["/camera"] },
    });

    expect(ranges).toEqual([{ length: 48n, offset: 1_000n }]);
  });
});

describe("collectChunkDataPrefetchRanges", () => {
  it("maps known chunk offsets to data ranges in time order", () => {
    const ranges = collectChunkDataPrefetchRanges({
      chunkIndexes: [
        createChunkIndex({
          chunkLength: 100n,
          chunkStartOffset: 2_000n,
          messageStartTime: 30n,
        }),
        createChunkIndex({
          chunkLength: 50n,
          chunkStartOffset: 1_000n,
          messageStartTime: 10n,
        }),
      ],
      request: { chunkStartOffsets: [2_000n, 1_000n, 2_000n, 9_999n] },
    });

    expect(ranges).toEqual([
      { length: 50n, offset: 1_000n },
      { length: 100n, offset: 2_000n },
    ]);
  });

  it("returns nothing for an empty offset set", () => {
    expect(
      collectChunkDataPrefetchRanges({
        chunkIndexes: [createChunkIndex({})],
        request: { chunkStartOffsets: [] },
      }),
    ).toEqual([]);
  });
});

describe("prefetchMcapByteRanges", () => {
  it("reads every range with bounded concurrency", async () => {
    const ranges: McapPrefetchByteRange[] = Array.from(
      { length: 7 },
      (_, index) => ({
        length: 10n,
        offset: BigInt(index) * 100n,
      }),
    );

    let inFlight = 0;
    let maxInFlight = 0;
    const started: bigint[] = [];
    const readable = {
      read: vi.fn(async (offset: bigint) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        started.push(offset);
        await Promise.resolve();
        inFlight -= 1;
        return new Uint8Array(10);
      }),
      size: vi.fn(async () => 10_000n),
    } as unknown as McapTypes.IReadable;

    await prefetchMcapByteRanges(readable, ranges, 3);

    expect(started).toHaveLength(7);
    expect(new Set(started)).toEqual(
      new Set(ranges.map((range) => range.offset)),
    );
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("swallows read failures and keeps warming later ranges", async () => {
    const succeeded: bigint[] = [];
    const readable = {
      read: vi.fn(async (offset: bigint) => {
        if (offset === 100n) {
          throw new Error("range failed");
        }
        succeeded.push(offset);
        return new Uint8Array(1);
      }),
      size: vi.fn(async () => 10_000n),
    } as unknown as McapTypes.IReadable;

    await expect(
      prefetchMcapByteRanges(
        readable,
        [
          { length: 1n, offset: 100n },
          { length: 1n, offset: 200n },
        ],
        1,
      ),
    ).resolves.toBeUndefined();
    expect(succeeded).toEqual([200n]);
  });

  it("skips empty ranges without reads", async () => {
    const readable = {
      read: vi.fn(async () => new Uint8Array(0)),
      size: vi.fn(async () => 10_000n),
    } as unknown as McapTypes.IReadable;

    await prefetchMcapByteRanges(readable, [{ length: 0n, offset: 0n }], 2);

    expect(readable.read).not.toHaveBeenCalled();
  });
});

function createChannels(): ReadonlyMap<
  number,
  McapTypes.TypedMcapRecords["Channel"]
> {
  return new Map([
    [7, createChannel({ id: 7, topic: "/camera" })],
    [8, createChannel({ id: 8, topic: "/lidar" })],
  ]);
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
