import { McapIndexedReader, McapWriter } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import type { ByteClient } from "../../../query/bytes";
import { ByteClientReadable } from "./byte-readable";
import {
  createCachedMcapDecompressHandlers,
  type McapChunkDecompressionContext,
  type McapDecompressHandler,
  type McapDecompressHandlers,
} from "./decompress-cache";
import {
  createMcapDecompressedChunkCache,
  type McapDecompressedChunkCache,
} from "./decompressed-chunk-cache";
import type { McapChunkIndex, McapReadable } from "./types";

interface IndexedReaderFixture {
  readonly chunkIndexes: readonly McapChunkIndex[];
  readMessages(): AsyncGenerator<unknown, void, void>;
}

interface IndexedReaderConstructor {
  Initialize(options: {
    readonly decompressHandlers: McapDecompressHandlers;
    readonly readable: McapReadable;
  }): Promise<IndexedReaderFixture>;
}

interface WriterFixture {
  addMessage(message: {
    readonly channelId: number;
    readonly data: Uint8Array;
    readonly logTime: bigint;
    readonly publishTime: bigint;
    readonly sequence: number;
  }): Promise<void>;
  end(): Promise<void>;
  registerChannel(channel: {
    readonly messageEncoding: string;
    readonly metadata: ReadonlyMap<string, string>;
    readonly schemaId: number;
    readonly topic: string;
  }): Promise<number>;
  start(header: {
    readonly library: string;
    readonly profile: string;
  }): Promise<void>;
}

interface WriterConstructor {
  new (options: {
    readonly compressChunk: (data: Uint8Array) => {
      readonly compressedData: Uint8Array;
      readonly compression: string;
    };
    readonly writable: MemoryWritable;
  }): WriterFixture;
}

function indexedReaderConstructor(): IndexedReaderConstructor {
  const candidate: unknown = McapIndexedReader;
  if (
    typeof candidate !== "function" ||
    !("Initialize" in candidate) ||
    typeof candidate.Initialize !== "function"
  ) {
    throw new Error("@mcap/core did not expose McapIndexedReader.Initialize");
  }
  return candidate;
}

function mcapWriterConstructor(): WriterConstructor {
  const candidate: unknown = McapWriter;
  if (typeof candidate !== "function") {
    throw new Error("@mcap/core did not expose McapWriter");
  }
  return candidate;
}

describe("McapIndexedReader decompression cache integration", () => {
  it("shares a stable chunk identity across fresh main-reader chunk copies", async () => {
    const mcap = await createIdentityCompressedMcap();
    const source = {
      etag: '"version-1"',
      sizeBytes: mcap.byteLength.toString(),
      sourceId: "source:main-reader",
      url: "bytes://main-reader",
    };
    const reads: Uint8Array[] = [];
    const byteClient: ByteClient = {
      readBytes: vi.fn<ByteClient["readBytes"]>((request) => {
        const bytes = mcap.slice(
          Number(request.range.offset),
          Number(request.range.offset + request.range.length),
        );
        reads.push(bytes);
        return Promise.resolve({
          bytes,
          range: request.range,
          source: request.source,
        });
      }),
    };
    const readable = new ByteClientReadable(source, byteClient);
    const decompressorInputs: Uint8Array[] = [];
    const contexts: McapChunkDecompressionContext[] = [];
    const decompress = vi.fn(
      (
        buffer: Uint8Array,
        _size: bigint,
        context?: McapChunkDecompressionContext,
      ) => {
        decompressorInputs.push(buffer);
        if (context) contexts.push(context);
        return buffer.slice();
      },
    );
    const cache = createMcapDecompressedChunkCache();
    const reader = await indexedReaderConstructor().Initialize({
      readable,
      decompressHandlers: createCachedMcapDecompressHandlers(
        { "identity-test": decompress },
        {
          cache,
        },
      ),
    });
    readable.setChunkIndexes(reader.chunkIndexes);

    await expect(collect(reader.readMessages())).resolves.toHaveLength(1);
    await expect(collect(reader.readMessages())).resolves.toHaveLength(1);

    expect(reads.length).toBeGreaterThan(2);
    expect(decompressorInputs).toHaveLength(1);
    const decompressorInput = decompressorInputs[0];
    const chunk = reader.chunkIndexes[0];
    if (!decompressorInput || !chunk) {
      throw new Error("Expected one decompressor input and chunk index");
    }
    expect(readable.sourceRangeForBytes(decompressorInput)).toBeUndefined();
    expect(contexts).toEqual([
      {
        chunkLength: chunk.chunkLength,
        chunkStartOffset: chunk.chunkStartOffset,
        compressedDataLength: chunk.compressedSize,
        compressedDataStartOffset:
          chunk.chunkStartOffset + chunk.chunkLength - chunk.compressedSize,
        compression: chunk.compression,
        sourceIdentity: readable.sourceAccessKey(),
        uncompressedSize: chunk.uncompressedSize,
      },
    ]);
    expect(decompress).toHaveBeenCalledTimes(1);
    cache.dispose();
    await expect(collect(reader.readMessages())).rejects.toThrow("disposed");
  });

  it("shares concurrent readers for one version and separates source versions", async () => {
    const mcap = await createIdentityCompressedMcap();
    const cache = createMcapDecompressedChunkCache();
    const decompress = vi.fn((buffer: Uint8Array) => buffer.slice());
    const first = await createMainReader({
      cache,
      decompress,
      etag: '"version-1"',
      mcap,
    });
    const second = await createMainReader({
      cache,
      decompress,
      etag: '"version-1"',
      mcap,
    });

    await Promise.all([
      collect(first.reader.readMessages()),
      collect(second.reader.readMessages()),
    ]);

    expect(decompress).toHaveBeenCalledTimes(1);

    const changed = await createMainReader({
      cache,
      decompress,
      etag: '"version-2"',
      mcap,
    });
    await collect(changed.reader.readMessages());

    expect(decompress).toHaveBeenCalledTimes(2);
    await collect(first.reader.readMessages());
    expect(decompress).toHaveBeenCalledTimes(3);
    cache.dispose();
  });

  it("does not retain failed or aborted main-reader loads", async () => {
    const mcap = await createIdentityCompressedMcap();
    const cache = createMcapDecompressedChunkCache();
    let fail = true;
    const decompress = vi.fn((buffer: Uint8Array) => {
      if (fail) {
        fail = false;
        throw new Error("decompression failed");
      }
      return buffer.slice();
    });
    const failing = await createMainReader({
      cache,
      decompress,
      etag: '"version-1"',
      mcap,
    });

    await expect(collect(failing.reader.readMessages())).rejects.toThrow(
      "decompression failed",
    );
    await expect(collect(failing.reader.readMessages())).resolves.toHaveLength(
      1,
    );
    expect(decompress).toHaveBeenCalledTimes(2);

    const controller = new AbortController();
    const readSignal = { current: controller.signal as AbortSignal | null };
    const abortedCache = createMcapDecompressedChunkCache();
    const aborted = await createMainReader({
      cache: abortedCache,
      decompress: vi.fn((buffer: Uint8Array) => buffer.slice()),
      etag: '"version-1"',
      mcap,
      readSignal,
    });
    controller.abort();
    await expect(collect(aborted.reader.readMessages())).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(aborted.decompress).not.toHaveBeenCalled();

    readSignal.current = null;
    await expect(collect(aborted.reader.readMessages())).resolves.toHaveLength(
      1,
    );
    expect(aborted.decompress).toHaveBeenCalledOnce();
    cache.dispose();
    abortedCache.dispose();
  });
});

async function createMainReader({
  cache,
  decompress,
  etag,
  mcap,
  readSignal,
}: {
  readonly cache: McapDecompressedChunkCache;
  readonly decompress: McapDecompressHandler;
  readonly etag: string;
  readonly mcap: Uint8Array;
  readonly readSignal?: { current: AbortSignal | null };
}): Promise<{
  readonly decompress: McapDecompressHandler;
  readonly reader: IndexedReaderFixture;
}> {
  const source = {
    etag,
    sizeBytes: mcap.byteLength.toString(),
    sourceId: "source:main-reader",
    url: "bytes://main-reader",
  };
  const byteClient: ByteClient = {
    readBytes: (request) =>
      Promise.resolve({
        bytes: mcap.slice(
          Number(request.range.offset),
          Number(request.range.offset + request.range.length),
        ),
        range: request.range,
        source: request.source,
      }),
  };
  const readable = new ByteClientReadable(source, byteClient, { readSignal });
  const reader = await indexedReaderConstructor().Initialize({
    decompressHandlers: createCachedMcapDecompressHandlers(
      { "identity-test": decompress },
      { cache },
    ),
    readable,
  });
  readable.setChunkIndexes(reader.chunkIndexes);
  return { decompress, reader };
}

async function createIdentityCompressedMcap(): Promise<Uint8Array> {
  const target = new MemoryWritable();
  const writer = new (mcapWriterConstructor())({
    compressChunk: (data: Uint8Array) => ({
      compressedData: data.slice(),
      compression: "identity-test",
    }),
    writable: target,
  });
  await writer.start({ library: "multimodal-test", profile: "" });
  const channelId = await writer.registerChannel({
    messageEncoding: "json",
    metadata: new Map(),
    schemaId: 0,
    topic: "/camera",
  });
  await writer.addMessage({
    channelId,
    data: new Uint8Array([1, 2, 3]),
    logTime: 1n,
    publishTime: 1n,
    sequence: 0,
  });
  await writer.end();
  return target.get().slice();
}

class MemoryWritable {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;

  position(): bigint {
    return BigInt(this.length);
  }

  write(data: Uint8Array): Promise<void> {
    this.chunks.push(data.slice());
    this.length += data.byteLength;
    return Promise.resolve();
  }

  get(): Uint8Array {
    const output = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }
}

async function collect<T>(
  messages: AsyncGenerator<T, void, void>,
): Promise<readonly T[]> {
  const output: T[] = [];
  for await (const message of messages) {
    output.push(message);
  }
  return output;
}
