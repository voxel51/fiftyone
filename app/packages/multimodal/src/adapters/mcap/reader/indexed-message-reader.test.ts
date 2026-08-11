import { crc32 } from "@foxglove/crc";
import { describe, expect, it, vi } from "vitest";
import type { McapContainedByteRead } from "./byte-readable";
import { createMcapDecompressedChunkCache } from "./decompressed-chunk-cache";
import { createMcapIndexedMessageReader } from "./indexed-message-reader";
import type {
  McapChunkIndex,
  McapIndexedMessageTime,
  McapIndexedReaderLike,
} from "./types";

interface FixtureMessage {
  readonly channelId: number;
  readonly data: number;
  readonly logTimeNs: bigint;
  readonly sequence: number;
  readonly topic: string;
}

interface ChunkFixture {
  readonly chunkBytes: Uint8Array;
  readonly chunkIndex: McapChunkIndex;
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

    const preWorkError = await cold
      .read({ entries: fixture.entries, signal: preAborted.signal })
      .catch((cause: unknown) => cause);
    expect(preWorkError).toBeInstanceOf(Error);
    expect(preWorkError).toMatchObject({
      message: "MCAP indexed message read aborted",
      name: "AbortError",
    });
    expect((preWorkError as Error).constructor).toBe(Error);
    expect((preWorkError as Error).stack).toContain(
      "indexed-message-reader.ts",
    );
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

    await expect(read).rejects.toMatchObject({
      message: "MCAP indexed message read aborted",
      name: "AbortError",
    });
    expect(inFlight.decompress).not.toHaveBeenCalled();
  });

  it("cancels a warm-cache indexed parse after bounded selected work", async () => {
    const fixture = buildChunkFixture({
      chunkStartOffset: 1_024n,
      marker: 1,
      messages: Array.from({ length: 65 }, (_, index) => ({
        channelId: 7,
        data: index,
        logTimeNs: BigInt(index),
        sequence: index,
        topic: "/camera",
      })),
    });
    const controller = new AbortController();
    let cancellationArmed = false;
    let armedYieldCount = 0;
    const harness = createHarness([fixture], {
      taskYield: () => {
        if (cancellationArmed && ++armedYieldCount === 1) {
          controller.abort();
        }
        return Promise.resolve();
      },
    });
    await harness.read({ entries: fixture.entries });
    const readsAfterWarm = harness.readContained.mock.calls.length;
    const decompressesAfterWarm = harness.decompress.mock.calls.length;
    cancellationArmed = true;

    await expect(
      harness.read({ entries: fixture.entries, signal: controller.signal }),
    ).rejects.toMatchObject({
      message: "MCAP indexed message read aborted",
      name: "AbortError",
    });

    expect(armedYieldCount).toBe(1);
    expect(harness.readContained).toHaveBeenCalledTimes(readsAfterWarm);
    expect(harness.decompress).toHaveBeenCalledTimes(decompressesAfterWarm);
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
    readonly taskYield?: () => Promise<void>;
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
      ((offset: bigint) =>
        Promise.resolve().then(() => {
          const fixture =
            options.fixtureForRead?.(offset) ?? byOffset.get(offset);
          if (!fixture) {
            throw new Error(`Missing chunk fixture at ${offset.toString()}`);
          }
          options.onRead?.();
          return containedRead(fixture);
        })),
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
    decompressedChunkCache: createMcapDecompressedChunkCache(
      options.maxCacheSizeBytes,
    ),
    decompressHandlers: { fake: decompress },
    readable: { readContained },
    reader: createReader(fixtures.map((fixture) => fixture.chunkIndex)),
    sourceKey: options.sourceKey ?? "source:etag-a",
    ...(options.taskYield ? { taskYield: options.taskYield } : {}),
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
  const recordParts: Uint8Array[] = [];
  let recordsLength = 0;
  const entries: McapIndexedMessageTime[] = [];
  for (const message of messages) {
    const messageOffset = BigInt(recordsLength);
    const record = encodeMessageRecord(message);
    recordParts.push(record);
    recordsLength += record.byteLength;
    entries.push({
      channelId: message.channelId,
      chunkStartOffset,
      logTimeNs: message.logTimeNs,
      messageOffset,
      topic: message.topic,
    });
  }
  const records = concatenateBytes(recordParts);
  const messageTimes = messages.map((message) => message.logTimeNs);
  const messageStartTime = messageTimes.reduce((min, value) =>
    value < min ? value : min,
  );
  const messageEndTime = messageTimes.reduce((max, value) =>
    value > max ? value : max,
  );
  const encoded = new Uint8Array([marker]);
  const chunkBytes = encodeChunkRecord({
    compression: "fake",
    messageEndTime,
    messageStartTime,
    records: encoded,
    uncompressedCrc: crc32(records),
    uncompressedSize: BigInt(records.byteLength),
  });

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
  chunkIndexes: readonly McapChunkIndex[],
): McapIndexedReaderLike {
  return {
    channelsById: new Map(),
    chunkIndexes,
    readMessages: vi.fn(() => asyncValues([])),
    schemasById: new Map(),
  };
}

function encodeMessageRecord(message: FixtureMessage): Uint8Array {
  const data = new Uint8Array([message.data]);
  const contentLength = 2 + 4 + 8 + 8 + data.byteLength;
  const record = new Uint8Array(9 + contentLength);
  const view = new DataView(record.buffer);
  view.setUint8(0, 0x05);
  view.setBigUint64(1, BigInt(contentLength), true);
  view.setUint16(9, message.channelId, true);
  view.setUint32(11, message.sequence, true);
  view.setBigUint64(15, message.logTimeNs, true);
  view.setBigUint64(23, message.logTimeNs + 1n, true);
  record.set(data, 31);
  return record;
}

function encodeChunkRecord({
  compression,
  messageEndTime,
  messageStartTime,
  records,
  uncompressedCrc,
  uncompressedSize,
}: {
  readonly compression: string;
  readonly messageEndTime: bigint;
  readonly messageStartTime: bigint;
  readonly records: Uint8Array;
  readonly uncompressedCrc: number;
  readonly uncompressedSize: bigint;
}): Uint8Array {
  const compressionBytes = new TextEncoder().encode(compression);
  const contentLength =
    8 + 8 + 8 + 4 + 4 + compressionBytes.byteLength + 8 + records.byteLength;
  const chunk = new Uint8Array(9 + contentLength);
  const view = new DataView(chunk.buffer);
  view.setUint8(0, 0x06);
  view.setBigUint64(1, BigInt(contentLength), true);
  view.setBigUint64(9, messageStartTime, true);
  view.setBigUint64(17, messageEndTime, true);
  view.setBigUint64(25, uncompressedSize, true);
  view.setUint32(33, uncompressedCrc, true);
  view.setUint32(37, compressionBytes.byteLength, true);
  chunk.set(compressionBytes, 41);
  const recordsLengthOffset = 41 + compressionBytes.byteLength;
  view.setBigUint64(recordsLengthOffset, BigInt(records.byteLength), true);
  chunk.set(records, recordsLengthOffset + 8);
  return chunk;
}

function concatenateBytes(parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

async function* asyncValues<Value>(
  values: Iterable<Value>,
): AsyncGenerator<Value, void, void> {
  for await (const value of values) {
    yield value;
  }
}
