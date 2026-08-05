import {
  McapIndexedReader,
  McapWriter,
  type IWritable,
  type McapTypes,
} from "@mcap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteClient } from "../../../query/bytes";
import {
  setMcapDecompressionCacheSink,
  type McapDecompressionCacheSample,
} from "../decompression-cache-meter";
import { ByteClientReadable } from "./byte-readable";
import { createCachedMcapDecompressHandlers } from "./decompress-cache";
import {
  createMcapDecompressedChunkCache,
  type McapDecompressedChunkCache,
} from "./decompressed-chunk-cache";

describe("McapIndexedReader decompression cache integration", () => {
  afterEach(() => setMcapDecompressionCacheSink(null));

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
      readBytes: vi.fn(async (request) => {
        const bytes = mcap.slice(
          Number(request.range.offset),
          Number(request.range.offset + request.range.length),
        );
        reads.push(bytes);
        return { bytes, range: request.range, source: request.source };
      }),
    };
    const readable = new ByteClientReadable(source, byteClient);
    const samples: McapDecompressionCacheSample[] = [];
    setMcapDecompressionCacheSink((sample) => samples.push(sample));
    const decompressorInputs: Uint8Array[] = [];
    const contexts: McapTypes.ChunkDecompressionContext[] = [];
    const decompress = vi.fn(
      (
        buffer: Uint8Array,
        _size: bigint,
        context?: McapTypes.ChunkDecompressionContext,
      ) => {
        decompressorInputs.push(buffer);
        if (context) contexts.push(context);
        return buffer.slice();
      },
    );
    const cache = createMcapDecompressedChunkCache();
    const reader = await McapIndexedReader.Initialize({
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
    expect(samples).toHaveLength(2);
    expect(samples.map(({ cacheHit }) => cacheHit)).toEqual([false, true]);
    expect(samples[0]?.chunkIdentityStable).toBe(true);
    expect(samples[1]?.chunkIdentity).toBe(samples[0]?.chunkIdentity);
    cache.dispose();
    await expect(collect(reader.readMessages())).rejects.toThrow("disposed");
  });

  it("shares concurrent readers for one version and separates source versions", async () => {
    const mcap = await createIdentityCompressedMcap();
    const samples: McapDecompressionCacheSample[] = [];
    setMcapDecompressionCacheSink((sample) => samples.push(sample));
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
    expect(samples.map(({ cacheHit }) => cacheHit)).toEqual([false, true]);
    const versionOneIdentity = samples[0]?.chunkIdentity;
    expect(versionOneIdentity).toBeDefined();

    const changed = await createMainReader({
      cache,
      decompress,
      etag: '"version-2"',
      mcap,
    });
    await collect(changed.reader.readMessages());

    expect(decompress).toHaveBeenCalledTimes(2);
    expect(samples.at(-1)).toMatchObject({
      cacheHit: false,
      chunkIdentityStable: true,
    });
    expect(samples.at(-1)?.chunkIdentity).not.toBe(versionOneIdentity);

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
  readonly decompress: McapTypes.DecompressHandlers[string];
  readonly etag: string;
  readonly mcap: Uint8Array;
  readonly readSignal?: { current: AbortSignal | null };
}): Promise<{
  readonly decompress: McapTypes.DecompressHandlers[string];
  readonly reader: McapIndexedReader;
}> {
  const source = {
    etag,
    sizeBytes: mcap.byteLength.toString(),
    sourceId: "source:main-reader",
    url: "bytes://main-reader",
  };
  const byteClient: ByteClient = {
    readBytes: async (request) => ({
      bytes: mcap.slice(
        Number(request.range.offset),
        Number(request.range.offset + request.range.length),
      ),
      range: request.range,
      source: request.source,
    }),
  };
  const readable = new ByteClientReadable(source, byteClient, { readSignal });
  const reader = await McapIndexedReader.Initialize({
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
  const writer = new McapWriter({
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

class MemoryWritable implements IWritable {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;

  position(): bigint {
    return BigInt(this.length);
  }

  async write(data: Uint8Array): Promise<void> {
    this.chunks.push(data.slice());
    this.length += data.byteLength;
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
