import { McapRecordBuilder, type McapTypes } from "@mcap/core";
import { describe, expect, it } from "vitest";
import type { ReadWorkBudget } from "../../../ports";
import {
  createCachedByteClient,
  createMemoryByteRangeCache,
  type ByteClient,
  type ByteRangeReadRequest,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import { createMcapBoundedReader } from "./bounded-read";
import {
  isMcapBoundedReadCancelledError,
  type McapBoundedReadCancelledError,
} from "./bounded-read-cancellation";
import { ByteClientReadable } from "./byte-readable";
import type {
  McapBoundedMessageReadRequest,
  McapIndexedReaderLike,
} from "./types";

interface MessageSpec {
  readonly channelId: number;
  readonly data?: Uint8Array;
  readonly logTime: bigint;
  readonly sequence?: number;
}

interface ChunkSpec {
  readonly compression?: "" | "fake";
  readonly indexEndTime?: bigint;
  readonly indexStartTime?: bigint;
  readonly messages: readonly MessageSpec[];
}

interface BuiltFixture {
  readonly bytes: Uint8Array;
  readonly chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][];
  readonly decompressedBySize: ReadonlyMap<string, Uint8Array>;
}

const source: ByteSourceDescriptor = {
  readProfile: "remote",
  sizeBytes: "1000000",
  sourceId: "bounded-fixture",
  url: "https://fixture.example/bounded.mcap",
};

describe("bounded MCAP reader", () => {
  it("opens no more chunks than one grant and resumes without omissions", async () => {
    const fixture = buildFixture(
      Array.from({ length: 100 }, (_, index) => ({
        messages: [
          {
            channelId: 1,
            logTime: BigInt(index * 10),
            sequence: index,
          },
        ],
      })),
    );
    const harness = createHarness(fixture);
    const grant = budgetFor(fixture.chunkIndexes.slice(0, 4), 4);
    const absolute = budgetFor(fixture.chunkIndexes, 100);
    const request = requestFor({
      absoluteBudget: absolute,
      absoluteMaxChunks: 4,
      budget: grant,
      maxChunks: 4,
    });

    const first = await harness.read(request);

    expect(first.stopReason).toBe("budget-exhausted");
    expect(first.usage.chunksOpened).toBe(4);
    expect(first.messages.map((message) => message.sequence)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(first.continuation).toBeDefined();
    expect(
      chunkBodyReads(harness.networkReads, fixture.chunkIndexes),
    ).toHaveLength(4);

    const messages = [...first.messages];
    let continuation = first.continuation;
    while (continuation) {
      const result = await harness.read({ ...request, continuation });
      messages.push(...result.messages);
      continuation = result.continuation;
    }

    expect(messages.map((message) => message.sequence)).toEqual(
      Array.from({ length: 100 }, (_, index) => index),
    );
    expect(new Set(messages.map(messageKey)).size).toBe(messages.length);
  });

  it("rejects continuations reused after source, topic, or window changes", async () => {
    const fixture = buildFixture([
      { messages: [{ channelId: 1, logTime: 0n }] },
      { messages: [{ channelId: 1, logTime: 10n }] },
    ]);
    let activeSourceKey = "source:etag-a";
    const harness = createHarness(fixture, ["/selected", "/other"], {
      sourceKey: () => activeSourceKey,
    });
    const full = budgetFor(fixture.chunkIndexes, 2);
    const grant = budgetFor(fixture.chunkIndexes.slice(0, 1), 1);
    const request = requestFor({
      absoluteBudget: full,
      absoluteMaxChunks: 1,
      budget: grant,
      maxChunks: 1,
    });
    const first = await harness.read(request);
    const continuation = first.continuation;
    if (!continuation) {
      throw new Error("fixture should return a continuation");
    }

    await expect(
      harness.read({
        ...request,
        continuation,
        topics: ["/other"],
      }),
    ).rejects.toThrow("does not match its source");
    await expect(
      harness.read({
        ...request,
        continuation,
        endTimeNs: 999n,
      }),
    ).rejects.toThrow("does not match its source");

    activeSourceKey = "source:etag-b";
    await expect(
      harness.read({
        ...request,
        continuation,
      }),
    ).rejects.toThrow("does not match its source");
  });

  it("treats overlapping chunks as one atomic ordered source unit", async () => {
    const fixture = buildFixture([
      {
        indexEndTime: 10n,
        indexStartTime: 0n,
        messages: [{ channelId: 1, logTime: 8n, sequence: 10 }],
      },
      {
        indexEndTime: 15n,
        indexStartTime: 5n,
        messages: [{ channelId: 1, logTime: 8n, sequence: 20 }],
      },
    ]);
    const harness = createHarness(fixture);
    const full = budgetFor(fixture.chunkIndexes, 2);

    const rejected = await harness.read(
      requestFor({
        absoluteBudget: full,
        absoluteMaxChunks: 1,
        budget: full,
        maxChunks: 1,
      }),
    );

    expect(rejected.stopReason).toBe("oversized-source-unit");
    expect(rejected.usage.chunksOpened).toBe(0);
    expect(rejected.continuation).toBeUndefined();
    expect(harness.networkReads).toHaveLength(0);

    const admitted = await harness.read(
      requestFor({
        absoluteBudget: full,
        absoluteMaxChunks: 2,
        budget: full,
        maxChunks: 2,
      }),
    );
    expect(admitted.stopReason).toBe("source-exhausted");
    expect(admitted.messages.map((message) => message.sequence)).toEqual([
      10, 20,
    ]);
  });

  it("rejects a transitively overlapping group above the absolute chunk ceiling", async () => {
    const fixture = buildFixture([
      {
        indexEndTime: 10n,
        indexStartTime: 0n,
        messages: [{ channelId: 1, logTime: 2n }],
      },
      {
        indexEndTime: 20n,
        indexStartTime: 8n,
        messages: [{ channelId: 1, logTime: 10n }],
      },
      {
        indexEndTime: 30n,
        indexStartTime: 18n,
        messages: [{ channelId: 1, logTime: 20n }],
      },
    ]);
    const harness = createHarness(fixture);
    const full = budgetFor(fixture.chunkIndexes, 3);

    const result = await harness.read(
      requestFor({
        absoluteBudget: full,
        absoluteMaxChunks: 2,
        budget: full,
        maxChunks: 2,
      }),
    );

    expect(result.stopReason).toBe("oversized-source-unit");
    expect(result.usage.chunksOpened).toBe(0);
    expect(result.continuation).toBeUndefined();
    expect(harness.networkReads).toHaveLength(0);
  });

  it("does not read an index or body when the next group misses its byte grant", async () => {
    const fixture = buildFixture([
      { messages: [{ channelId: 1, logTime: 0n }] },
    ]);
    const harness = createHarness(fixture);
    const full = budgetFor(fixture.chunkIndexes, 1);

    const result = await harness.read(
      requestFor({
        absoluteBudget: full,
        absoluteMaxChunks: 1,
        budget: { ...full, maxSourceBytes: full.maxSourceBytes - 1 },
        maxChunks: 1,
      }),
    );

    expect(result.stopReason).toBe("budget-exhausted");
    expect(result.usage.logicalSourceBytes).toBe(0);
    expect(harness.networkReads).toHaveLength(0);
  });

  it("rejects an absolute oversized unit before fetching it", async () => {
    const fixture = buildFixture([
      { messages: [{ channelId: 1, logTime: 0n }] },
    ]);
    const harness = createHarness(fixture);
    const full = budgetFor(fixture.chunkIndexes, 1);

    const result = await harness.read(
      requestFor({
        absoluteBudget: {
          ...full,
          maxSourceBytes: full.maxSourceBytes - 1,
        },
        absoluteMaxChunks: 1,
        budget: full,
        maxChunks: 1,
      }),
    );

    expect(result.stopReason).toBe("oversized-source-unit");
    expect(result.usage.chunksOpened).toBe(0);
    expect(result.continuation).toBeUndefined();
    expect(harness.networkReads).toHaveLength(0);
  });

  it("charges widened chunk fills while keeping message-index reads exact", async () => {
    const fixture = buildFixture([
      { messages: [{ channelId: 1, logTime: 0n }] },
    ]);
    const harness = createHarness(fixture, ["/selected"], {
      blockSizeBytes: 128,
    });

    const result = await harness.read(requestFor({}));
    const exactIndexReads = harness.networkReads.filter(
      (read) => read.cachePolicy?.blockFill === false,
    );
    const chunkFills = harness.networkReads.filter(
      (read) => read.cachePolicy?.blockFill !== false,
    );

    expect(result.stopReason).toBe("source-exhausted");
    expect(exactIndexReads).toHaveLength(1);
    expect(exactIndexReads[0].range.length).toBeLessThan(128n);
    expect(exactIndexReads[0].cachePolicy?.readahead).toBe(false);
    expect(chunkFills).toHaveLength(1);
    expect(chunkFills[0].range).toEqual({ length: 128n, offset: 1_024n });
    expect(chunkFills[0].cachePolicy?.readahead).toBe(false);
    expect(result.usage.logicalSourceBytes).toBe(
      harness.networkReads.reduce(
        (sum, read) => sum + Number(read.range.length),
        0,
      ),
    );
  });

  it("reads shared selected channels once and distinguishes warm-cache work", async () => {
    const fixture = buildFixture([
      {
        compression: "fake",
        messages: [
          { channelId: 1, logTime: 5n, sequence: 1 },
          {
            channelId: 3,
            data: new Uint8Array(256).fill(9),
            logTime: 5n,
            sequence: 2,
          },
          { channelId: 2, logTime: 5n, sequence: 3 },
        ],
      },
    ]);
    const harness = createHarness(fixture, ["/selected-a", "/selected-b"]);
    const full = budgetFor(fixture.chunkIndexes, 2);
    const request = requestFor({
      absoluteBudget: full,
      absoluteMaxChunks: 1,
      budget: full,
      maxChunks: 1,
      topics: ["/selected-a", "/selected-b"],
    });

    const cold = await harness.read(request);
    const networkReadsAfterCold = harness.networkReads.length;
    const warm = await harness.read(request);

    expect(cold.messages.map((message) => message.channelId)).toEqual([1, 2]);
    expect(cold.usage.chunksOpened).toBe(1);
    expect(cold.usage.decompressedBytes).toBeGreaterThan(0);
    expect(cold.usage.decompressionCacheHits).toBe(0);
    expect(cold.usage.transferredBytes).toBeGreaterThan(0);
    expect(warm.messages.map((message) => message.channelId)).toEqual([1, 2]);
    expect(warm.usage.logicalSourceBytes).toBe(cold.usage.logicalSourceBytes);
    expect(warm.usage.logicalUncompressedBytes).toBe(
      cold.usage.logicalUncompressedBytes,
    );
    expect(warm.usage.decompressedBytes).toBe(0);
    expect(warm.usage.decompressionCacheHits).toBe(1);
    expect(warm.usage.transferredBytes).toBe(0);
    expect(harness.networkReads).toHaveLength(networkReadsAfterCold);
    expect(
      chunkBodyReads(harness.networkReads, fixture.chunkIndexes),
    ).toHaveLength(1);
  });

  it("propagates abort to an in-flight contained range request", async () => {
    const fixture = buildFixture([
      { messages: [{ channelId: 1, logTime: 0n }] },
    ]);
    const controller = new AbortController();
    const harness = createHarness(fixture, ["/selected"], {
      onNetworkRead(request) {
        if (
          fixture.chunkIndexes.some(
            (chunk) => chunk.chunkStartOffset === request.range.offset,
          )
        ) {
          controller.abort();
        }
      },
    });
    const full = budgetFor(fixture.chunkIndexes, 1);

    const cancellation = await captureCancellation(
      harness.read(
        requestFor({
          absoluteBudget: full,
          absoluteMaxChunks: 1,
          budget: full,
          maxChunks: 1,
          signal: controller.signal,
        }),
      ),
    );

    expect(cancellation.usage.chunksOpened).toBe(1);
    expect(cancellation.usage.logicalSourceBytes).toBeGreaterThan(0);
    expect(cancellation.usage.logicalUncompressedBytes).toBeGreaterThan(0);
    expect(cancellation.usage.messagesDecoded).toBe(0);
  });

  it("propagates abort from an exact message-index request before body work", async () => {
    const fixture = buildFixture([
      { messages: [{ channelId: 1, logTime: 0n }] },
    ]);
    const controller = new AbortController();
    const harness = createHarness(fixture, ["/selected"], {
      onNetworkRead(request) {
        if (request.cachePolicy?.blockFill === false) {
          controller.abort();
        }
      },
    });

    const cancellation = await captureCancellation(
      harness.read(
        requestFor({
          signal: controller.signal,
        }),
      ),
    );
    expect(cancellation.usage.chunksOpened).toBe(0);
    expect(cancellation.usage.logicalSourceBytes).toBeGreaterThan(0);
    expect(
      chunkBodyReads(harness.networkReads, fixture.chunkIndexes),
    ).toHaveLength(0);
  });

  it("stops after one atomic decompression and reports completed work", async () => {
    const controller = new AbortController();
    const fixture = buildFixture([
      {
        compression: "fake",
        messages: Array.from({ length: 8 }, (_, index) => ({
          channelId: 1,
          logTime: BigInt(index),
        })),
      },
      {
        compression: "fake",
        messages: [{ channelId: 1, logTime: 20n }],
      },
    ]);
    const harness = createHarness(fixture, ["/selected"], {
      onDecompress: () => controller.abort(),
    });

    const cancellation = await captureCancellation(
      harness.read(requestFor({ signal: controller.signal })),
    );

    expect(cancellation.usage.chunksOpened).toBe(1);
    expect(cancellation.usage.decompressedBytes).toBeGreaterThan(0);
    expect(cancellation.usage.messagesDecoded).toBe(0);
    expect(
      chunkBodyReads(harness.networkReads, fixture.chunkIndexes),
    ).toHaveLength(1);
  });

  it("yields during a warm-cache decode walk and reports partial progress", async () => {
    const fixture = buildFixture([
      {
        compression: "fake",
        messages: Array.from({ length: 130 }, (_, index) => ({
          channelId: 1,
          logTime: BigInt(index),
          sequence: index,
        })),
      },
    ]);
    const harness = createHarness(fixture);
    const full = budgetFor(fixture.chunkIndexes, 130);
    const request = requestFor({
      absoluteBudget: full,
      absoluteMaxChunks: 1,
      budget: full,
      endTimeNs: 200n,
      maxChunks: 1,
    });
    await harness.read(request);
    const readsAfterWarm = harness.networkReads.length;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 0);

    const cancellation = await captureCancellation(
      harness.read({ ...request, signal: controller.signal }),
    );

    expect(cancellation.usage.chunksOpened).toBe(1);
    expect(cancellation.usage.decompressionCacheHits).toBe(1);
    expect(cancellation.usage.decompressedBytes).toBe(0);
    expect(cancellation.usage.messagesDecoded).toBe(64);
    expect(cancellation.usage.transferredBytes).toBe(0);
    expect(harness.networkReads).toHaveLength(readsAfterWarm);
  });

  it("reports independent coverage for streams with different chunk density", async () => {
    const fixture = buildFixture([
      { messages: [{ channelId: 1, logTime: 0n }] },
      {
        messages: [
          { channelId: 1, logTime: 10n },
          { channelId: 2, logTime: 10n },
        ],
      },
    ]);
    const harness = createHarness(fixture, ["/dense", "/sparse"]);

    const result = await harness.read(
      requestFor({ topics: ["/dense", "/sparse"] }),
    );

    expect(result.coverageByTopic.get("/dense")).toEqual([
      { endNs: 0n, startNs: 0n },
      { endNs: 10n, startNs: 10n },
    ]);
    expect(result.coverageByTopic.get("/sparse")).toEqual([
      { endNs: 10n, startNs: 10n },
    ]);
  });

  it("returns before index or body work when wall-time is already exhausted", async () => {
    const fixture = buildFixture([
      { messages: [{ channelId: 1, logTime: 0n }] },
    ]);
    const harness = createHarness(fixture);

    const result = await harness.read(
      requestFor({
        budget: {
          ...requestFor({}).budget,
          maxWallTimeMs: 0,
        },
      }),
    );

    expect(result.stopReason).toBe("budget-exhausted");
    expect(result.usage.chunksOpened).toBe(0);
    expect(harness.networkReads).toHaveLength(0);
  });

  it("returns a continuation before the next group after wall-time expires", async () => {
    const fixture = buildFixture([
      { messages: [{ channelId: 1, logTime: 0n }] },
      { messages: [{ channelId: 1, logTime: 10n }] },
    ]);
    let nowMs = 0;
    const firstChunkOffset = fixture.chunkIndexes[0].chunkStartOffset;
    const harness = createHarness(fixture, ["/selected"], {
      nowMs: () => nowMs,
      onNetworkRead: (request) => {
        if (request.range.offset === firstChunkOffset) {
          nowMs = 101;
        }
      },
    });
    const full = budgetFor(fixture.chunkIndexes, 2);

    const result = await harness.read(
      requestFor({
        absoluteBudget: full,
        budget: { ...full, maxWallTimeMs: 100 },
      }),
    );

    expect(result.stopReason).toBe("budget-exhausted");
    expect(result.usage.chunksOpened).toBe(1);
    expect(result.continuation).toBeDefined();
    expect(
      chunkBodyReads(harness.networkReads, fixture.chunkIndexes),
    ).toHaveLength(1);
  });
});

function createHarness(
  fixture: BuiltFixture,
  selectedTopics: readonly string[] = ["/selected"],
  options: {
    readonly blockSizeBytes?: number;
    readonly nowMs?: () => number;
    readonly onDecompress?: () => void;
    readonly onNetworkRead?: (request: ByteRangeReadRequest) => void;
    readonly sourceKey?: string | (() => string);
  } = {},
) {
  const channels = new Map([
    [1, channel(1, selectedTopics[0] ?? "/selected")],
    [2, channel(2, selectedTopics[1] ?? "/selected-b")],
    [3, channel(3, "/filler")],
  ]);
  const reader: McapIndexedReaderLike = {
    channelsById: channels,
    chunkIndexes: fixture.chunkIndexes,
    readMessages: async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    },
    schemasById: new Map(),
  };
  const networkReads: ByteRangeReadRequest[] = [];
  const network: ByteClient = {
    async readBytes(request) {
      networkReads.push(request);
      options.onNetworkRead?.(request);
      if (request.signal?.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      const start = Number(request.range.offset);
      const end = start + Number(request.range.length);
      return {
        bytes: fixture.bytes.subarray(start, end),
        range: request.range,
        source: request.source,
      };
    },
  };
  const bytes = createCachedByteClient(network, {
    blockSizeBytes: options.blockSizeBytes ?? 1,
    locks: false,
    memory: createMemoryByteRangeCache({ maxSizeBytes: 4 * 1024 * 1024 }),
    persistent: false,
  });
  const readable = new ByteClientReadable(
    { ...source, sizeBytes: fixture.bytes.byteLength.toString() },
    bytes,
  );
  const read = createMcapBoundedReader({
    decompressHandlers: {
      fake: (_compressed: Uint8Array, size: bigint) => {
        options.onDecompress?.();
        const records = fixture.decompressedBySize.get(size.toString());
        if (!records) {
          throw new Error(`missing fake decompression payload for ${size}`);
        }
        return records;
      },
    },
    ...(options.nowMs ? { nowMs: options.nowMs } : {}),
    readable,
    reader,
    sourceKey: options.sourceKey ?? "bounded-fixture-key",
  });
  return { networkReads, read };
}

async function captureCancellation(
  promise: Promise<unknown>,
): Promise<McapBoundedReadCancelledError> {
  try {
    await promise;
  } catch (error) {
    expect(isMcapBoundedReadCancelledError(error)).toBe(true);
    return error as McapBoundedReadCancelledError;
  }
  throw new Error("expected bounded read cancellation");
}

function buildFixture(specs: readonly ChunkSpec[]): BuiltFixture {
  const placements: Array<{ bytes: Uint8Array; offset: bigint }> = [];
  const pending: Array<{
    readonly chunkBytes: Uint8Array;
    readonly chunkStartOffset: bigint;
    readonly compression: string;
    readonly indexEndTime: bigint;
    readonly indexStartTime: bigint;
    readonly messageIndexes: ReadonlyMap<
      number,
      readonly (readonly [bigint, bigint])[]
    >;
    readonly records: Uint8Array;
  }> = [];
  const decompressedBySize = new Map<string, Uint8Array>();
  let cursor = 1_024n;

  for (const spec of specs) {
    const recordsBuilder = new McapRecordBuilder();
    const messageIndexes = new Map<number, Array<readonly [bigint, bigint]>>();
    for (const message of spec.messages) {
      const messageOffset = BigInt(recordsBuilder.length);
      recordsBuilder.writeMessage({
        channelId: message.channelId,
        data: message.data ?? new Uint8Array([message.channelId]),
        logTime: message.logTime,
        publishTime: message.logTime,
        sequence: message.sequence ?? Number(message.logTime),
      });
      let entries = messageIndexes.get(message.channelId);
      if (!entries) {
        entries = [];
        messageIndexes.set(message.channelId, entries);
      }
      entries.push([message.logTime, messageOffset]);
    }
    const records = recordsBuilder.buffer.slice();
    const compression = spec.compression ?? "";
    const storedRecords =
      compression === "fake" ? new Uint8Array([0xfa]) : records;
    const times = spec.messages.map((message) => message.logTime);
    const indexStartTime =
      spec.indexStartTime ??
      times.reduce((first, time) => (time < first ? time : first), times[0]);
    const indexEndTime =
      spec.indexEndTime ??
      times.reduce((last, time) => (time > last ? time : last), times[0]);
    const chunkBuilder = new McapRecordBuilder();
    chunkBuilder.writeChunk({
      compression,
      messageEndTime: indexEndTime,
      messageStartTime: indexStartTime,
      records: storedRecords,
      uncompressedCrc: 0,
      uncompressedSize: BigInt(records.byteLength),
    });
    const chunkBytes = chunkBuilder.buffer.slice();
    const chunkStartOffset = cursor;
    placements.push({ bytes: chunkBytes, offset: chunkStartOffset });
    pending.push({
      chunkBytes,
      chunkStartOffset,
      compression,
      indexEndTime,
      indexStartTime,
      messageIndexes,
      records,
    });
    if (compression === "fake") {
      decompressedBySize.set(records.byteLength.toString(), records);
    }
    cursor += BigInt(chunkBytes.byteLength) + 64n;
  }

  const chunkIndexes: McapTypes.TypedMcapRecords["ChunkIndex"][] = [];
  for (const chunk of pending) {
    const messageIndexOffsets = new Map<number, bigint>();
    const messageIndexStart = cursor;
    for (const [channelId, records] of chunk.messageIndexes) {
      const indexBuilder = new McapRecordBuilder();
      indexBuilder.writeMessageIndex({
        channelId,
        records: records.map(([time, offset]) => [time, offset]),
      });
      const indexBytes = indexBuilder.buffer.slice();
      messageIndexOffsets.set(channelId, cursor);
      placements.push({ bytes: indexBytes, offset: cursor });
      cursor += BigInt(indexBytes.byteLength);
    }
    chunkIndexes.push({
      chunkLength: BigInt(chunk.chunkBytes.byteLength),
      chunkStartOffset: chunk.chunkStartOffset,
      compressedSize:
        chunk.compression.length > 0 ? 1n : BigInt(chunk.records.byteLength),
      compression: chunk.compression,
      messageEndTime: chunk.indexEndTime,
      messageIndexLength: cursor - messageIndexStart,
      messageIndexOffsets,
      messageStartTime: chunk.indexStartTime,
      type: "ChunkIndex",
      uncompressedSize: BigInt(chunk.records.byteLength),
    });
    cursor += 64n;
  }

  const bytes = new Uint8Array(Number(cursor + 64n));
  for (const placement of placements) {
    bytes.set(placement.bytes, Number(placement.offset));
  }
  return { bytes, chunkIndexes, decompressedBySize };
}

function budgetFor(
  chunks: readonly McapTypes.TypedMcapRecords["ChunkIndex"][],
  maxMessages: number,
): ReadWorkBudget {
  const maxSourceBytes = chunks.reduce(
    (sum, chunk) => sum + Number(chunk.chunkLength + chunk.messageIndexLength),
    0,
  );
  const maxUncompressedBytes = chunks.reduce(
    (sum, chunk) => sum + Number(chunk.uncompressedSize),
    0,
  );
  return {
    maxMessages,
    maxSourceBytes,
    maxUncompressedBytes,
    maxWallTimeMs: 10_000,
  };
}

function requestFor(
  overrides: Partial<McapBoundedMessageReadRequest>,
): McapBoundedMessageReadRequest {
  const fallback: ReadWorkBudget = {
    maxMessages: 100,
    maxSourceBytes: 1_000_000,
    maxUncompressedBytes: 1_000_000,
    maxWallTimeMs: 10_000,
  };
  return {
    absoluteBudget: fallback,
    absoluteMaxChunks: 4,
    budget: fallback,
    endTimeNs: 1_000n,
    maxChunks: 4,
    startTimeNs: 0n,
    topics: ["/selected"],
    ...overrides,
  };
}

function channel(
  id: number,
  topic: string,
): McapTypes.TypedMcapRecords["Channel"] {
  return {
    id,
    messageEncoding: "protobuf",
    metadata: new Map(),
    schemaId: 0,
    topic,
    type: "Channel",
  };
}

function chunkBodyReads(
  reads: readonly ByteRangeReadRequest[],
  chunks: readonly McapTypes.TypedMcapRecords["ChunkIndex"][],
) {
  const offsets = new Set(chunks.map((chunk) => chunk.chunkStartOffset));
  return reads.filter((read) => offsets.has(read.range.offset));
}

function messageKey(message: McapTypes.TypedMcapRecords["Message"]): string {
  return [message.logTime.toString(), message.channelId, message.sequence].join(
    ":",
  );
}
