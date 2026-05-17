import type {
  FetchFunctionConfig,
  FetchFunctionResult,
} from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";
import type { Decoder } from "../../decoders";
import { DecoderRegistry } from "../../decoders";
import { VISUALIZATION_KIND } from "../../visualization";
import {
  decodedOutputCacheKey,
  createMemoryByteRangeCache,
  createMemoryDecodedOutputCache,
} from "./cache";
import {
  createCachedByteResourceClient,
  createDecodeResourceClient,
  createHttpByteResourceClient,
} from "./clients";
import {
  BYTE_SOURCE_READ_PROFILE,
  DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
  DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
  type ByteRangeReadRequest,
  type ByteResourceClient,
  type DecodeExecutor,
} from "./index";

type ExtendedFetchFunction = <Body, Result>(
  config: FetchFunctionConfig<Body>
) => Promise<FetchFunctionResult<Result>>;

interface FetchCall {
  readonly body: unknown;
  readonly headers: Record<string, string> | undefined;
  readonly method: string;
  readonly path: string;
  readonly result: FetchFunctionConfig<unknown>["result"];
}

describe("multimodal resource clients", () => {
  it("reads HTTP byte ranges with explicit Range headers", async () => {
    const { calls, extendedFetch } = createFetchMock({
      "bytes://source/default": new Uint8Array([1, 2, 3]).buffer,
    });
    const client = createHttpByteResourceClient(extendedFetch);

    await expect(
      client.readBytes({
        range: { length: 3n, offset: 4n },
        source: {
          ...createByteRangeReadRequest().source,
          sizeBytes: "7",
        },
      })
    ).resolves.toMatchObject({ bytes: new Uint8Array([1, 2, 3]) });

    expect(calls[0]?.headers).toEqual({ Range: "bytes=4-6" });
  });

  it("fills and reuses the raw byte cache", async () => {
    const request = createByteRangeReadRequest();
    const reader: ByteResourceClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({ maxSizeBytes: 128 });
    const client = createCachedByteResourceClient(reader, { memory: cache });

    await client.readBytes(request);
    await client.readBytes(request);

    expect(reader.readBytes).toHaveBeenCalledTimes(1);
  });

  it("keeps delimiter-like source values distinct in byte cache keys", async () => {
    const cache = createMemoryByteRangeCache({ maxSizeBytes: 128 });
    const first = createByteRangeReadRequest({
      source: {
        sizeBytes: "128",
        sourceId: "source|1",
        url: "nested|path",
      },
    });
    const second = createByteRangeReadRequest({
      source: {
        sizeBytes: "128",
        sourceId: "source",
        url: "1|nested|path",
      },
    });

    await cache.put({
      bytes: new Uint8Array([1]),
      range: first.range,
      source: first.source,
    });
    await cache.put({
      bytes: new Uint8Array([2]),
      range: second.range,
      source: second.source,
    });

    await expect(cache.get(first)).resolves.toMatchObject({
      bytes: new Uint8Array([1]),
    });
    await expect(cache.get(second)).resolves.toMatchObject({
      bytes: new Uint8Array([2]),
    });
  });

  it("keeps delimiter-like decoded cache components distinct", () => {
    const payload = {
      encoding: "custom",
      schema: "custom.Schema",
      schemaEncoding: "custom-schema",
    };

    expect(
      decodedOutputCacheKey({
        decoderId: "decoder|1",
        decoderOptionsKey: "options",
        decoderVersion: "version",
        payload,
        recordId: "record",
        streamId: "stream",
      })
    ).not.toBe(
      decodedOutputCacheKey({
        decoderId: "decoder",
        decoderOptionsKey: "options",
        decoderVersion: "1|version",
        payload,
        recordId: "record",
        streamId: "stream",
      })
    );
  });

  it("serves byte subranges from block cache fills", async () => {
    const reader: ByteResourceClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({ maxSizeBytes: 128 });
    const client = createCachedByteResourceClient(reader, {
      blockSizeBytes: 64,
      memory: cache,
    });
    const first = createByteRangeReadRequest({
      range: { length: 4n, offset: 4n },
    });
    const second = createByteRangeReadRequest({
      range: { length: 4n, offset: 12n },
    });

    await expect(client.readBytes(first)).resolves.toMatchObject({
      bytes: new Uint8Array([4, 5, 6, 7]),
    });
    await expect(client.readBytes(second)).resolves.toMatchObject({
      bytes: new Uint8Array([12, 13, 14, 15]),
    });

    expect(reader.readBytes).toHaveBeenCalledTimes(1);
    expect(reader.readBytes).toHaveBeenCalledWith({
      range: { length: 64n, offset: 0n },
      source: first.source,
    });
  });

  it("allows callers to skip block cache fills for scattered exact reads", async () => {
    const reader: ByteResourceClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({ maxSizeBytes: 128 });
    const client = createCachedByteResourceClient(reader, {
      blockSizeBytes: 64,
      memory: cache,
    });
    const request = createByteRangeReadRequest({
      cachePolicy: { blockFill: false },
      range: { length: 4n, offset: 4n },
    });

    await expect(client.readBytes(request)).resolves.toMatchObject({
      bytes: new Uint8Array([4, 5, 6, 7]),
    });

    expect(reader.readBytes).toHaveBeenCalledWith(request);
  });

  it("uses larger default block fills for explicitly remote sources", async () => {
    const reader: ByteResourceClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({
      maxSizeBytes: DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES * 2,
    });
    const client = createCachedByteResourceClient(reader, { memory: cache });
    const request = createByteRangeReadRequest({
      range: { length: 4n, offset: 4n },
      source: {
        readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE,
        sizeBytes: (DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES * 2).toString(),
        sourceId: "object://bucket/source.bin",
        url: "object://bucket/source.bin",
      },
    });

    await expect(client.readBytes(request)).resolves.toMatchObject({
      bytes: new Uint8Array([4, 5, 6, 7]),
    });

    expect(reader.readBytes).toHaveBeenCalledWith({
      range: {
        length: BigInt(DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES),
        offset: 0n,
      },
      source: request.source,
    });
  });

  it("does not infer remote block fills from source URL text", async () => {
    const reader: ByteResourceClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({
      maxSizeBytes: DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES * 2,
    });
    const client = createCachedByteResourceClient(reader, { memory: cache });
    const request = createByteRangeReadRequest({
      range: { length: 4n, offset: 4n },
      source: {
        sizeBytes: (DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES * 2).toString(),
        sourceId: "object://bucket/source.bin",
        url: "object://bucket/source.bin",
      },
    });

    await client.readBytes(request);

    expect(reader.readBytes).toHaveBeenCalledWith({
      range: {
        length: BigInt(DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES),
        offset: 0n,
      },
      source: request.source,
    });
  });

  it("does not expand cache fills with invalid block sizes", async () => {
    for (const blockSizeBytes of [0, -1, 1.5, Number.NaN]) {
      const reader: ByteResourceClient = {
        readBytes: vi.fn(async (readRequest) => ({
          bytes: bytesForRange(readRequest),
          range: readRequest.range,
          source: readRequest.source,
        })),
      };
      const cache = createMemoryByteRangeCache({ maxSizeBytes: 128 });
      const request = createByteRangeReadRequest({
        range: { length: 4n, offset: 4n },
      });
      const client = createCachedByteResourceClient(reader, {
        blockSizeBytes,
        memory: cache,
      });

      await client.readBytes(request);

      expect(reader.readBytes).toHaveBeenCalledWith(request);
    }
  });

  it("coalesces in-flight byte cache fills", async () => {
    const reader: ByteResourceClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({ maxSizeBytes: 128 });
    const client = createCachedByteResourceClient(reader, {
      blockSizeBytes: 64,
      memory: cache,
    });

    await Promise.all([
      client.readBytes(
        createByteRangeReadRequest({ range: { length: 4n, offset: 4n } })
      ),
      client.readBytes(
        createByteRangeReadRequest({ range: { length: 4n, offset: 12n } })
      ),
    ]);

    expect(reader.readBytes).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed source size metadata when resolving content ranges", async () => {
    const { extendedFetch } = createFetchMock({
      "bytes://source/default": new Uint8Array([1, 2, 3]).buffer,
    });
    const client = createHttpByteResourceClient(extendedFetch);

    await expect(
      client.readBytes({
        range: { length: 3n, offset: 4n },
        source: {
          ...createByteRangeReadRequest().source,
          sizeBytes: "not-a-number",
        },
      })
    ).resolves.toMatchObject({
      source: {
        sizeBytes: "7",
      },
    });
  });

  it("uses decoded cache hits without re-running decoders", async () => {
    const payload = {
      encoding: "custom",
      schema: "custom.Schema",
      schemaEncoding: "custom-schema",
    };
    const decoder: Decoder = {
      decode: vi.fn(() => ({
        attributes: { value: 1 },
        visualization: {
          bytes: new Uint8Array([1]),
          kind: VISUALIZATION_KIND.ENCODED_IMAGE,
        },
      })),
      id: "custom-decoder",
      payload,
      version: "1",
    };
    const registry = new DecoderRegistry();
    registry.register(decoder);
    const client = createDecodeResourceClient({
      cache: createMemoryDecodedOutputCache({ maxSizeBytes: 128 }),
      registry,
    });
    const request = {
      bytes: new Uint8Array([1]),
      cache: {
        recordId: "record-1",
        source: createByteRangeReadRequest().source,
        streamId: "stream-1",
      },
      context: { streamId: "stream-1" },
      payload,
    };

    await client.decode(request);
    await client.decode({ ...request, bytes: new Uint8Array([2]) });

    expect(decoder.decode).toHaveBeenCalledTimes(1);
  });

  it("allows decode execution to be injected for worker-backed hot paths", async () => {
    const payload = {
      encoding: "custom",
      schema: "custom.Schema",
      schemaEncoding: "custom-schema",
    };
    const decoder: Decoder = {
      decode: vi.fn(() => ({
        attributes: { value: 1 },
        visualization: {
          bytes: new Uint8Array([1]),
          kind: VISUALIZATION_KIND.ENCODED_IMAGE,
        },
      })),
      id: "custom-decoder",
      payload,
      version: "1",
    };
    const registry = new DecoderRegistry();
    registry.register(decoder);
    const executor: DecodeExecutor = {
      decode: vi.fn(({ bytes, context, decoder: activeDecoder }) =>
        activeDecoder.decode(bytes, context)
      ),
    };
    const client = createDecodeResourceClient({
      cache: createMemoryDecodedOutputCache({ maxSizeBytes: 128 }),
      executor,
      registry,
    });
    const bytes = new Uint8Array([1]);
    const context = { streamId: "stream-1" };

    await client.decode({
      bytes,
      context: {
        ...context,
        schemaData: new Uint8Array([2]),
      },
      payload,
    });

    expect(executor.decode).toHaveBeenCalledWith({
      bytes,
      context: {
        ...context,
        schemaData: new Uint8Array([2]),
      },
      decoder,
      payload,
    });
  });

  it("fails loudly when no decoder can decode a payload", async () => {
    const client = createDecodeResourceClient({
      cache: createMemoryDecodedOutputCache({ maxSizeBytes: 128 }),
      registry: new DecoderRegistry(),
    });

    await expect(
      client.decode({
        bytes: new Uint8Array([1]),
        context: { streamId: "stream-1" },
        payload: {
          encoding: "missing",
          schema: "missing.Schema",
          schemaEncoding: "missing-schema",
        },
      })
    ).rejects.toThrow("No decoder registered");
  });
});

function createFetchMock(
  responses: Readonly<Record<string, ArrayBufferLike>>
): {
  calls: FetchCall[];
  extendedFetch: ExtendedFetchFunction;
} {
  const calls: FetchCall[] = [];
  const extendedFetch: ExtendedFetchFunction = async <Body, Result>(
    config: FetchFunctionConfig<Body>
  ): Promise<FetchFunctionResult<Result>> => {
    const { body, headers, method, path, result } = config;
    calls.push({ body, headers, method, path, result });

    const response = responses[path];
    if (!response) {
      throw new Error(`No mock response for ${path}`);
    }

    return {
      headers: headers?.Range
        ? new Headers({
            "Content-Range": contentRangeHeader(headers.Range, response),
          })
        : undefined,
      response: response as Result,
    };
  };

  return { calls, extendedFetch };
}

function contentRangeHeader(rangeHeader: string, response: ArrayBufferLike) {
  const match = /^bytes=(\d+)-(\d+)$/.exec(rangeHeader);
  if (!match) {
    throw new Error(`Unexpected range header ${rangeHeader}`);
  }

  return `bytes ${match[1]}-${match[2]}/${
    Number(match[1]) + response.byteLength
  }`;
}

function createByteRangeReadRequest(
  overrides: Partial<ByteRangeReadRequest> = {}
): ByteRangeReadRequest {
  return {
    ...(overrides.cachePolicy ? { cachePolicy: overrides.cachePolicy } : {}),
    range: overrides.range ?? { length: 16n, offset: 4n },
    source: overrides.source ?? {
      sizeBytes: "128",
      sourceId: "source:1",
      url: "bytes://source/default",
    },
  };
}

function bytesForRange(request: ByteRangeReadRequest): Uint8Array {
  return Uint8Array.from(
    { length: Number(request.range.length) },
    (_, index) => Number(request.range.offset) + index
  );
}
