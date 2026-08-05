import { McapRecordBuilder, type McapTypes } from "@mcap/core";
import { crc32 } from "@foxglove/crc";
import { describe, expect, it, vi } from "vitest";
import type { McapContainedByteRead } from "./byte-readable";
import { ByteClientReadable } from "./byte-readable";
import { createMcapIndexedMessageReader } from "./indexed-message-reader";
import type { McapIndexedMessageTime, McapIndexedReaderLike } from "./types";

interface FixtureMessage {
  readonly channelId: number;
  readonly data: number;
  readonly logTimeNs: bigint;
  readonly sequence: number;
  readonly topic: string;
}

interface ChunkFixture {
  readonly chunkBytes: Uint8Array;
  readonly chunkIndex: McapTypes.TypedMcapRecords["ChunkIndex"];
  readonly entries: readonly McapIndexedMessageTime[];
  readonly marker: number;
  readonly records: Uint8Array;
}

describe("indexed MCAP message reader", () => {
  it("decompresses one shared chunk once, preserves request order, and reuses it", async () => {
    const fixture = buildChunkFixture({
      chunkStartOffset: 1_024n,
      marker: 1,
      messages: [
        {
          channelId: 7,
          data: 11,
          logTimeNs: 100n,
          sequence: 1,
          topic: "/camera",
        },
        {
          channelId: 8,
          data: 22,
          logTimeNs: 200n,
          sequence: 2,
          topic: "/lidar",
        },
      ],
    });
    const harness = createHarness([fixture]);

    const first = await harness.read({
      entries: [fixture.entries[1], fixture.entries[0]],
    });
    first[0].data[0] = 99;
    const second = await harness.read({ entries: [fixture.entries[1]] });

    expect(first.map((message) => message.sequence)).toEqual([2, 1]);
    expect(first.map((message) => Array.from(message.data))).toEqual([
      [99],
      [11],
    ]);
    expect(Array.from(second[0].data)).toEqual([22]);
    expect(harness.readContained).toHaveBeenCalledTimes(1);
    expect(harness.decompress).toHaveBeenCalledTimes(1);
  });

  it("does not reuse chunk bytes after source identity changes", async () => {
    const firstSource = buildChunkFixture({
      chunkStartOffset: 1_024n,
      marker: 1,
      messages: [
        {
          channelId: 7,
          data: 11,
          logTimeNs: 100n,
          sequence: 1,
          topic: "/camera",
        },
      ],
    });
    const secondSource = buildChunkFixture({
      chunkStartOffset: 1_024n,
      marker: 2,
      messages: [
        {
          channelId: 7,
          data: 22,
          logTimeNs: 100n,
          sequence: 2,
          topic: "/camera",
        },
      ],
    });
    let sourceKey = "source:etag-a";
    const harness = createHarness([firstSource, secondSource], {
      fixtureForRead: () =>
        sourceKey === "source:etag-a" ? firstSource : secondSource,
      sourceKey: () => sourceKey,
    });

    const first = await harness.read({ entries: firstSource.entries });
    sourceKey = "source:etag-b";
    const second = await harness.read({ entries: secondSource.entries });

    expect(first[0]).toMatchObject({ sequence: 1 });
    expect(Array.from(first[0].data)).toEqual([11]);
    expect(second[0]).toMatchObject({ sequence: 2 });
    expect(Array.from(second[0].data)).toEqual([22]);
    expect(harness.readContained).toHaveBeenCalledTimes(2);
    expect(harness.decompress).toHaveBeenCalledTimes(2);
  });

  it("admits discovered bytes only under the new source identity", async () => {
    const fixture = buildChunkFixture({
      chunkStartOffset: 1_024n,
      marker: 1,
      messages: [
        {
          channelId: 7,
          data: 11,
          logTimeNs: 100n,
          sequence: 1,
          topic: "/camera",
        },
      ],
    });
    let sourceKey = "source:etag-a";
    const harness = createHarness([fixture], {
      onRead: () => {
        sourceKey = "source:etag-b";
      },
      sourceKey: () => sourceKey,
    });

    await harness.read({ entries: fixture.entries });
    await harness.read({ entries: fixture.entries });
    await harness.read({ entries: fixture.entries });

    expect(harness.readContained).toHaveBeenCalledTimes(1);
    expect(harness.decompress).toHaveBeenCalledTimes(1);
  });

  it("evicts within budget and never retains an oversized chunk", async () => {
    const first = buildChunkFixture({
      chunkStartOffset: 1_024n,
      marker: 1,
      messages: [
        {
          channelId: 7,
          data: 11,
          logTimeNs: 100n,
          sequence: 1,
          topic: "/camera",
        },
      ],
    });
    const second = buildChunkFixture({
      chunkStartOffset: 2_048n,
      marker: 2,
      messages: [
        {
          channelId: 8,
          data: 22,
          logTimeNs: 200n,
          sequence: 2,
          topic: "/lidar",
        },
      ],
    });
    const bounded = createHarness([first, second], {
      maxCacheSizeBytes: Math.max(
        first.records.byteLength,
        second.records.byteLength,
      ),
    });

    await bounded.read({ entries: first.entries });
    await bounded.read({ entries: second.entries });
    await bounded.read({ entries: first.entries });

    expect(bounded.decompress).toHaveBeenCalledTimes(3);

    const oversized = createHarness([first], {
      maxCacheSizeBytes: first.records.byteLength - 1,
    });
    await oversized.read({ entries: first.entries });
    await oversized.read({ entries: first.entries });

    expect(oversized.decompress).toHaveBeenCalledTimes(2);
    expect(oversized.readContained).toHaveBeenCalledTimes(2);
  });

  it("rejects corrupt chunks and chunk-index metadata mismatches", async () => {
    const fixture = buildChunkFixture({
      chunkStartOffset: 1_024n,
      marker: 1,
      messages: [
        {
          channelId: 7,
          data: 11,
          logTimeNs: 100n,
          sequence: 1,
          topic: "/camera",
        },
      ],
    });
    const badOpcode = fixture.chunkBytes.slice();
    badOpcode[0] = 0;
    const corrupt = createHarness([fixture], {
      fixtureForRead: () => ({ ...fixture, chunkBytes: badOpcode }),
    });

    await expect(corrupt.read({ entries: fixture.entries })).rejects.toThrow(
      "Expected MCAP Chunk record",
    );

    const mismatched = createHarness([
      {
        ...fixture,
        chunkIndex: {
          ...fixture.chunkIndex,
          uncompressedSize: fixture.chunkIndex.uncompressedSize + 1n,
        },
      },
    ]);
    await expect(mismatched.read({ entries: fixture.entries })).rejects.toThrow(
      "MCAP chunk index/data mismatch",
    );

    const badCrc = createHarness([fixture], {
      decompressedForMarker: () => {
        const records = fixture.records.slice();
        records[records.byteLength - 1] ^= 0xff;
        return records;
      },
    });
    await expect(badCrc.read({ entries: fixture.entries })).rejects.toThrow(
      "Incorrect MCAP chunk CRC",
    );
  });

  it.each([
    ["offset", { messageOffset: 1n }, "Expected MCAP Message"],
    ["channel", { channelId: 8 }, "MCAP message index/data mismatch"],
    ["timestamp", { logTimeNs: 101n }, "MCAP message index/data mismatch"],
  ])(
    "rejects an indexed %s that does not match the message record",
    async (_label, overrides, expected) => {
      const fixture = buildChunkFixture({
        chunkStartOffset: 1_024n,
        marker: 1,
        messages: [
          {
            channelId: 7,
            data: 11,
            logTimeNs: 100n,
            sequence: 1,
            topic: "/camera",
          },
        ],
      });
      const harness = createHarness([fixture]);

      await expect(
        harness.read({
          entries: [{ ...fixture.entries[0], ...overrides }],
        }),
      ).rejects.toThrow(expected);
    },
  );

  it("propagates cancellation before and after an in-flight chunk read", async () => {
    const fixture = buildChunkFixture({
      chunkStartOffset: 1_024n,
      marker: 1,
      messages: [
        {
          channelId: 7,
          data: 11,
          logTimeNs: 100n,
          sequence: 1,
          topic: "/camera",
        },
      ],
    });
    const preAborted = new AbortController();
    preAborted.abort();
    const cold = createHarness([fixture]);

    await expect(
      cold.read({ entries: fixture.entries, signal: preAborted.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(cold.readContained).not.toHaveBeenCalled();

    let resolveRead: (value: McapContainedByteRead) => void = () => undefined;
    const pendingRead = new Promise<McapContainedByteRead>((resolve) => {
      resolveRead = resolve;
    });
    const readContained = vi.fn(() => pendingRead);
    const controller = new AbortController();
    const inFlight = createHarness([fixture], { readContained });
    const read = inFlight.read({
      entries: fixture.entries,
      signal: controller.signal,
    });

    expect(readContained).toHaveBeenCalledWith(
      fixture.chunkIndex.chunkStartOffset,
      fixture.chunkIndex.chunkLength,
      { signal: controller.signal },
    );
    controller.abort();
    resolveRead(containedRead(fixture));

    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(inFlight.decompress).not.toHaveBeenCalled();
  });
});

function createHarness(
  fixtures: readonly ChunkFixture[],
  options: {
    readonly decompressedForMarker?: (marker: number) => Uint8Array;
    readonly fixtureForRead?: (offset: bigint) => ChunkFixture;
    readonly maxCacheSizeBytes?: number;
    readonly onRead?: () => void;
    readonly readContained?: (
      offset: bigint,
      size: bigint,
      options: { readonly signal?: AbortSignal },
    ) => Promise<McapContainedByteRead>;
    readonly sourceKey?: string | (() => string);
  } = {},
) {
  const byOffset = new Map(
    fixtures.map((fixture) => [fixture.chunkIndex.chunkStartOffset, fixture]),
  );
  const byMarker = new Map(
    fixtures.map((fixture) => [fixture.marker, fixture.records]),
  );
  const readContained = vi.fn(
    options.readContained ??
      (async (offset: bigint) => {
        const fixture =
          options.fixtureForRead?.(offset) ?? byOffset.get(offset);
        if (!fixture) {
          throw new Error(`Missing chunk fixture at ${offset.toString()}`);
        }
        options.onRead?.();
        return containedRead(fixture);
      }),
  );
  const decompress = vi.fn((encoded: Uint8Array) => {
    const marker = encoded[0] ?? -1;
    const records =
      options.decompressedForMarker?.(marker) ?? byMarker.get(marker);
    if (!records) {
      throw new Error(`Missing decompressed fixture for marker ${marker}`);
    }
    return records;
  });
  const read = createMcapIndexedMessageReader({
    decompressHandlers: { fake: decompress },
    ...(options.maxCacheSizeBytes !== undefined
      ? { maxCacheSizeBytes: options.maxCacheSizeBytes }
      : {}),
    readable: { readContained } as unknown as ByteClientReadable,
    reader: createReader(fixtures.map((fixture) => fixture.chunkIndex)),
    sourceKey: options.sourceKey ?? "source:etag-a",
  });

  return { decompress, read, readContained };
}

function containedRead(fixture: ChunkFixture): McapContainedByteRead {
  return {
    bytes: fixture.chunkBytes,
    fillRange: {
      length: fixture.chunkIndex.chunkLength,
      offset: fixture.chunkIndex.chunkStartOffset,
    },
    transferredBytes: fixture.chunkBytes.byteLength,
  };
}

function buildChunkFixture({
  chunkStartOffset,
  marker,
  messages,
}: {
  readonly chunkStartOffset: bigint;
  readonly marker: number;
  readonly messages: readonly FixtureMessage[];
}): ChunkFixture {
  const recordsBuilder = new McapRecordBuilder();
  const entries: McapIndexedMessageTime[] = [];
  for (const message of messages) {
    const messageOffset = BigInt(recordsBuilder.length);
    recordsBuilder.writeMessage({
      channelId: message.channelId,
      data: new Uint8Array([message.data]),
      logTime: message.logTimeNs,
      publishTime: message.logTimeNs + 1n,
      sequence: message.sequence,
    });
    entries.push({
      channelId: message.channelId,
      chunkStartOffset,
      logTimeNs: message.logTimeNs,
      messageOffset,
      topic: message.topic,
    });
  }
  const records = recordsBuilder.buffer.slice();
  const messageTimes = messages.map((message) => message.logTimeNs);
  const messageStartTime = messageTimes.reduce((min, value) =>
    value < min ? value : min,
  );
  const messageEndTime = messageTimes.reduce((max, value) =>
    value > max ? value : max,
  );
  const encoded = new Uint8Array([marker]);
  const chunkBuilder = new McapRecordBuilder();
  chunkBuilder.writeChunk({
    compression: "fake",
    messageEndTime,
    messageStartTime,
    records: encoded,
    uncompressedCrc: crc32(records),
    uncompressedSize: BigInt(records.byteLength),
  });
  const chunkBytes = chunkBuilder.buffer.slice();

  return {
    chunkBytes,
    chunkIndex: {
      chunkLength: BigInt(chunkBytes.byteLength),
      chunkStartOffset,
      compressedSize: BigInt(encoded.byteLength),
      compression: "fake",
      messageEndTime,
      messageIndexLength: 0n,
      messageIndexOffsets: new Map(),
      messageStartTime,
      type: "ChunkIndex",
      uncompressedSize: BigInt(records.byteLength),
    },
    entries,
    marker,
    records,
  };
}

function createReader(
  chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][],
): McapIndexedReaderLike {
  return {
    channelsById: new Map(),
    chunkIndexes,
    readMessages: vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    }),
    schemasById: new Map(),
  };
}
