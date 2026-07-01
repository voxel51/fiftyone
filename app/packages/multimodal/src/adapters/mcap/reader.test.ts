import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import type { ByteClient } from "../../query/bytes";
import {
  createMcapReaderStore,
  parseMcapMessageIndexRecord,
  readIndexedMessageTimesForReader,
  type McapIndexedReaderLike,
} from "./reader";
import { ByteClientReadable } from "./reader/byte-readable";

const MCAP_CHUNK_OPCODE = 0x06;
const MCAP_MESSAGE_INDEX_OPCODE = 0x07;

describe("MCAP indexed message times", () => {
  it("reads only the requested topic's message index range", async () => {
    const cameraIndex = createMessageIndexRecord(7, [
      [10n, 1n],
      [20n, 2n],
    ]);
    const lidarIndex = createMessageIndexRecord(8, [[11n, 3n]]);
    const cameraOffset = 64n;
    const lidarOffset = cameraOffset + BigInt(cameraIndex.byteLength);
    const { exactReads, readable, reads } = createReadable([
      { bytes: cameraIndex, offset: cameraOffset },
      { bytes: lidarIndex, offset: lidarOffset },
    ]);
    const reader = createReader({
      chunkIndexes: [
        createChunkIndex({
          messageEndTime: 20n,
          messageIndexLength: BigInt(
            cameraIndex.byteLength + lidarIndex.byteLength,
          ),
          messageIndexOffsets: new Map([
            [7, cameraOffset],
            [8, lidarOffset],
          ]),
          messageStartTime: 10n,
        }),
      ],
    });

    const entries = await collect(
      readIndexedMessageTimesForReader(reader, readable, {
        topics: ["/camera"],
      }),
    );

    expect(entries.map((entry) => entry.logTimeNs)).toEqual([10n, 20n]);
    expect(entries.map((entry) => entry.topic)).toEqual(["/camera", "/camera"]);
    expect(reads).toEqual([
      {
        offset: cameraOffset,
        size: BigInt(cameraIndex.byteLength),
      },
    ]);
    expect(exactReads).toEqual(reads);
  });

  it("stops after the limit for ordered chunks", async () => {
    const firstIndex = createMessageIndexRecord(7, [[10n, 1n]]);
    const secondIndex = createMessageIndexRecord(7, [[20n, 2n]]);
    const firstOffset = 64n;
    const secondOffset = 128n;
    const { readable, reads } = createReadable([
      { bytes: firstIndex, offset: firstOffset },
      { bytes: secondIndex, offset: secondOffset },
    ]);
    const reader = createReader({
      chunkIndexes: [
        createChunkIndex({
          chunkStartOffset: 1_000n,
          messageEndTime: 10n,
          messageIndexLength: BigInt(firstIndex.byteLength),
          messageIndexOffsets: new Map([[7, firstOffset]]),
          messageStartTime: 10n,
        }),
        createChunkIndex({
          chunkStartOffset: 2_000n,
          messageEndTime: 20n,
          messageIndexLength: BigInt(secondIndex.byteLength),
          messageIndexOffsets: new Map([[7, secondOffset]]),
          messageStartTime: 20n,
        }),
      ],
    });

    const entries = await collect(
      readIndexedMessageTimesForReader(reader, readable, {
        limit: 1,
        topics: ["/camera"],
      }),
    );

    expect(entries.map((entry) => entry.logTimeNs)).toEqual([10n]);
    expect(reads).toEqual([
      {
        offset: firstOffset,
        size: BigInt(firstIndex.byteLength),
      },
    ]);
  });

  it("sorts overlapping chunks before applying the limit", async () => {
    const laterIndex = createMessageIndexRecord(7, [[30n, 3n]]);
    const earlierIndex = createMessageIndexRecord(7, [[20n, 2n]]);
    const laterOffset = 64n;
    const earlierOffset = 128n;
    const { readable } = createReadable([
      { bytes: laterIndex, offset: laterOffset },
      { bytes: earlierIndex, offset: earlierOffset },
    ]);
    const reader = createReader({
      chunkIndexes: [
        createChunkIndex({
          chunkStartOffset: 1_000n,
          messageEndTime: 30n,
          messageIndexLength: BigInt(laterIndex.byteLength),
          messageIndexOffsets: new Map([[7, laterOffset]]),
          messageStartTime: 10n,
        }),
        createChunkIndex({
          chunkStartOffset: 2_000n,
          messageEndTime: 40n,
          messageIndexLength: BigInt(earlierIndex.byteLength),
          messageIndexOffsets: new Map([[7, earlierOffset]]),
          messageStartTime: 20n,
        }),
      ],
    });

    const entries = await collect(
      readIndexedMessageTimesForReader(reader, readable, {
        limit: 1,
        topics: ["/camera"],
      }),
    );

    expect(entries.map((entry) => entry.logTimeNs)).toEqual([20n]);
  });

  it("ignores non-integer indexed message limits", async () => {
    const index = createMessageIndexRecord(7, [[10n, 1n]]);
    const offset = 64n;
    const { readable, reads } = createReadable([{ bytes: index, offset }]);
    const reader = createReader({
      chunkIndexes: [
        createChunkIndex({
          messageEndTime: 10n,
          messageIndexLength: BigInt(index.byteLength),
          messageIndexOffsets: new Map([[7, offset]]),
          messageStartTime: 10n,
        }),
      ],
    });

    await expect(
      collect(
        readIndexedMessageTimesForReader(reader, readable, {
          limit: 1.5,
          topics: ["/camera"],
        }),
      ),
    ).resolves.toEqual([]);
    expect(reads).toEqual([]);
  });

  it("rejects malformed message index records", () => {
    const bytes = createMessageIndexRecord(7, [[10n, 1n]]);
    bytes[0] = MCAP_CHUNK_OPCODE;

    expect(() => parseMcapMessageIndexRecord(bytes)).toThrow(
      "Expected MCAP MessageIndex record",
    );
  });

  it("rejects message index records with leftover content bytes", () => {
    const bytes = messageIndexRecordWithExtraContentByte(
      createMessageIndexRecord(7, [[10n, 1n]]),
    );

    expect(() => parseMcapMessageIndexRecord(bytes)).toThrow(
      "MCAP MessageIndex records byte range mismatch",
    );
  });

  it("caches delimiter-like source identities independently", async () => {
    const readerFactory = vi.fn(async () =>
      createReader({
        chunkIndexes: [],
      }),
    );
    const byteClient: ByteClient = {
      readBytes: vi.fn(),
    };
    const readerStore = createMcapReaderStore({ byteClient, readerFactory });

    await readerStore.get(
      createSource({
        sourceId: "source|1",
        url: "nested|path",
      }),
    );
    await readerStore.get(
      createSource({
        sourceId: "source",
        url: "1|nested|path",
      }),
    );

    expect(readerFactory).toHaveBeenCalledTimes(2);
  });

  it("recreates readers when the source URL changes", async () => {
    const readerFactory = vi.fn(async () =>
      createReader({
        chunkIndexes: [],
      }),
    );
    const byteClient: ByteClient = {
      readBytes: vi.fn(),
    };
    const readerStore = createMcapReaderStore({ byteClient, readerFactory });

    await readerStore.get(
      createSource({
        sourceId: "source:1",
        url: "bytes://source/old",
      }),
    );
    await readerStore.get(
      createSource({
        sourceId: "source:1",
        url: "bytes://source/new",
      }),
    );

    expect(readerFactory).toHaveBeenCalledTimes(2);
  });

  it("reuses readers when only source size is discovered", async () => {
    const readerFactory = vi.fn(async () =>
      createReader({
        chunkIndexes: [],
      }),
    );
    const byteClient: ByteClient = {
      readBytes: vi.fn(),
    };
    const readerStore = createMcapReaderStore({ byteClient, readerFactory });

    await readerStore.get(
      createSource({
        sourceId: "source:1",
        url: "bytes://source",
      }),
    );
    await readerStore.get({
      sizeBytes: "256",
      sourceId: "source:1",
      url: "bytes://source",
    });

    expect(readerFactory).toHaveBeenCalledTimes(1);
  });

  it("uses descriptor size before probing byte clients", async () => {
    const byteClient: ByteClient = {
      readBytes: vi.fn(),
      stat: vi.fn(),
    };
    const readable = new ByteClientReadable(
      {
        sizeBytes: "128",
        sourceId: "source:1",
        url: "mcap-source://sample",
      },
      byteClient,
    );

    await expect(readable.size()).resolves.toBe(128n);
    expect(byteClient.stat).not.toHaveBeenCalled();
    expect(byteClient.readBytes).not.toHaveBeenCalled();
  });

  it("uses byte client stat when descriptor size is missing", async () => {
    const byteClient: ByteClient = {
      readBytes: vi.fn(),
      stat: vi.fn(async (source) => ({
        ...source,
        sizeBytes: "128",
      })),
    };
    const readable = new ByteClientReadable(
      {
        sourceId: "source:1",
        url: "mcap-source://sample",
      },
      byteClient,
    );

    await expect(readable.size()).resolves.toBe(128n);
    expect(byteClient.stat).toHaveBeenCalledWith({
      sourceId: "source:1",
      url: "mcap-source://sample",
    });
    expect(byteClient.readBytes).not.toHaveBeenCalled();
  });

  it("falls back to a tiny range read when stat cannot resolve size", async () => {
    const byteClient: ByteClient = {
      readBytes: vi.fn(
        async (request: Parameters<ByteClient["readBytes"]>[0]) => ({
          bytes: new Uint8Array([1]),
          range: request.range,
          source: {
            ...request.source,
            sizeBytes: "128",
          },
        }),
      ),
      stat: vi.fn(async () => undefined),
    };
    const source = {
      sourceId: "source:1",
      url: "mcap-source://sample",
    };
    const readable = new ByteClientReadable(source, byteClient);

    await expect(readable.size()).resolves.toBe(128n);
    expect(byteClient.stat).toHaveBeenCalledWith(source);
    expect(byteClient.readBytes).toHaveBeenCalledWith({
      range: { length: 1n, offset: 0n },
      source,
    });
  });

  it("ignores malformed source sizes before byte reads", async () => {
    const readBytes = vi.fn(
      async (request: Parameters<ByteClient["readBytes"]>[0]) => ({
        bytes: new Uint8Array([1]),
        range: request.range,
        source: request.source,
      }),
    );
    const readable = new ByteClientReadable(
      {
        sizeBytes: "not-a-number",
        sourceId: "source:1",
        url: "mcap-source://sample",
      },
      { readBytes },
    );

    await expect(readable.read(128n, 1n)).resolves.toEqual(new Uint8Array([1]));
    expect(readBytes).toHaveBeenCalledWith({
      cachePolicy: undefined,
      range: { length: 1n, offset: 128n },
      source: {
        sizeBytes: "not-a-number",
        sourceId: "source:1",
        url: "mcap-source://sample",
      },
    });
  });
});

async function collect<T>(
  generator: AsyncGenerator<T, void, void>,
): Promise<readonly T[]> {
  const messages: T[] = [];
  for await (const message of generator) {
    messages.push(message);
  }

  return messages;
}

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
  readonly exactReads: Array<{
    readonly offset: bigint;
    readonly size: bigint;
  }>;
  readonly readable: McapTypes.IReadable;
  readonly reads: Array<{ readonly offset: bigint; readonly size: bigint }>;
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

  const reads: Array<{ readonly offset: bigint; readonly size: bigint }> = [];
  const exactReads: Array<{ readonly offset: bigint; readonly size: bigint }> =
    [];
  const readRange = vi.fn(async (offset: bigint, readSize: bigint) => {
    reads.push({ offset, size: readSize });
    return buffer.slice(Number(offset), Number(offset + readSize));
  });

  return {
    exactReads,
    readable: {
      read: readRange,
      readExact: vi.fn(async (offset, readSize) => {
        exactReads.push({ offset, size: readSize });
        return readRange(offset, readSize);
      }),
      size: vi.fn(async () => BigInt(buffer.byteLength)),
    } as McapTypes.IReadable,
    reads,
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

function messageIndexRecordWithExtraContentByte(
  record: Uint8Array,
): Uint8Array {
  const bytes = new Uint8Array(record.byteLength + 1);
  bytes.set(record);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(1, view.getBigUint64(1, true) + 1n, true);

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

function createSource({
  sourceId,
  url,
}: {
  readonly sourceId: string;
  readonly url: string;
}) {
  return {
    sizeBytes: "128",
    sourceId,
    url,
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
