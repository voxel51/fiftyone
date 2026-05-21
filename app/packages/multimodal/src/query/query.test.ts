import type {
  FetchFunctionConfig,
  FetchFunctionResult,
} from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";
import type { Decoder } from "../decoders";
import { DecoderRegistry } from "../decoders";
import { VISUALIZATION_KIND } from "../visualization";
import {
  byteSourceCacheKey,
  createMemoryByteRangeCache,
  createCachedByteClient,
  createHttpByteClient,
  BYTE_SOURCE_READ_PROFILE,
  DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
  DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
  type ByteRangeReadRequest,
  type ByteClient,
} from "./bytes";
import {
  decodedOutputCacheKey,
  createMemoryDecodedOutputCache,
  createDecodeClient,
  type DecodeExecutor,
} from "./decode";

type ExtendedFetchFunction = <Body, Result>(
  config: FetchFunctionConfig<Body> & { readonly signal?: AbortSignal }
) => Promise<FetchFunctionResult<Result>>;

interface FetchCall {
  readonly body: unknown;
  readonly headers: Record<string, string> | undefined;
  readonly method: string;
  readonly path: string;
  readonly result: FetchFunctionConfig<unknown>["result"];
  readonly signal: AbortSignal | undefined;
}

describe("multimodal query clients", () => {
  it("reads HTTP byte ranges with explicit Range headers", async () => {
    const { calls, extendedFetch } = createFetchMock({
      "bytes://source/default": new Uint8Array([1, 2, 3]).buffer,
    });
    const client = createHttpByteClient(extendedFetch);

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

  it("stats HTTP byte sources with HEAD Content-Length", async () => {
    const { calls, extendedFetch } = createFetchMock({
      "bytes://source/default": new Uint8Array(7).buffer,
    });
    const client = createHttpByteClient(extendedFetch);
    const source = {
      sourceId: "source:1",
      url: "bytes://source/default",
    };

    await expect(client.stat?.(source)).resolves.toEqual({
      ...source,
      sizeBytes: "7",
    });
    expect(calls[0]).toMatchObject({
      method: "HEAD",
      path: "bytes://source/default",
      result: "arrayBuffer",
    });
  });

  it("falls back to ranged GET when HEAD does not report size", async () => {
    const { calls, extendedFetch } = createFetchMock(
      {
        "bytes://source/default": new Uint8Array([1, 2, 3]).buffer,
      },
      { head: "missing" }
    );
    const client = createHttpByteClient(extendedFetch);
    const request = {
      ...createByteRangeReadRequest(),
      range: { length: 3n, offset: 4n },
      source: {
        sourceId: "source:1",
        url: "bytes://source/default",
      },
    };

    await expect(client.stat?.(request.source)).resolves.toBeUndefined();
    await expect(client.readBytes(request)).resolves.toMatchObject({
      bytes: new Uint8Array([1, 2, 3]),
      source: {
        sizeBytes: "7",
      },
    });
    expect(calls.map((call) => call.method)).toEqual(["HEAD", "GET"]);
  });

  it("treats failed HTTP HEAD size probes as unknown size", async () => {
    const { extendedFetch } = createFetchMock(
      {
        "bytes://source/default": new Uint8Array([1, 2, 3]).buffer,
      },
      { head: "fail" }
    );
    const client = createHttpByteClient(extendedFetch);

    await expect(
      client.stat?.({
        sourceId: "source:1",
        url: "bytes://source/default",
      })
    ).resolves.toBeUndefined();
  });

  it("overrides stale source size hints from Content-Range", async () => {
    const { extendedFetch } = createFetchMock({
      "bytes://source/default": new Uint8Array([1, 2, 3]).buffer,
    });
    const client = createHttpByteClient(extendedFetch);

    await expect(
      client.readBytes({
        range: { length: 3n, offset: 4n },
        source: {
          ...createByteRangeReadRequest().source,
          sizeBytes: "999",
        },
      })
    ).resolves.toMatchObject({
      source: {
        sizeBytes: "7",
      },
    });
  });

  it("fills and reuses the raw byte cache", async () => {
    const request = createByteRangeReadRequest();
    const reader: ByteClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({ maxSizeBytes: 128 });
    const client = createCachedByteClient(reader, { memory: cache });

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

  it("keeps byte source cache keys stable when size is discovered", () => {
    expect(
      byteSourceCacheKey({
        sourceId: "source:1",
        url: "bytes://source/old",
      })
    ).toBe(
      byteSourceCacheKey({
        sizeBytes: "128",
        sourceId: "source:1",
        url: "bytes://source/new",
      })
    );
  });

  it("reuses byte cache entries across discovered size and URL changes", async () => {
    const cache = createMemoryByteRangeCache({ maxSizeBytes: 128 });
    const cached = createByteRangeReadRequest({
      range: { length: 64n, offset: 0n },
      source: {
        sizeBytes: "128",
        sourceId: "source:1",
        url: "bytes://source/old",
      },
    });
    const request = createByteRangeReadRequest({
      range: { length: 4n, offset: 4n },
      source: {
        sourceId: "source:1",
        url: "bytes://source/new",
      },
    });

    await cache.put({
      bytes: bytesForRange(cached),
      range: cached.range,
      source: cached.source,
    });

    await expect(cache.get(request)).resolves.toMatchObject({
      bytes: new Uint8Array([4, 5, 6, 7]),
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

  it("normalizes invalid byte-cache size options", async () => {
    for (const maxSizeBytes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const cache = createMemoryByteRangeCache({ maxSizeBytes });
      const request = createByteRangeReadRequest({
        range: { length: 2n, offset: 0n },
      });

      await cache.put({
        bytes: new Uint8Array([1, 2]),
        range: request.range,
        source: request.source,
      });

      await expect(cache.get(request)).resolves.toBeUndefined();
    }
  });

  it("sizes circular decoded outputs without recursing forever", async () => {
    const cache = createMemoryDecodedOutputCache({ maxSizeBytes: 128 });
    const attributes: Record<string, unknown> = {};
    attributes.self = attributes;

    await expect(
      cache.put(
        {
          decoderId: "decoder",
          decoderVersion: "1",
          payload: { encoding: "custom" },
          recordId: "record",
          streamId: "stream",
        },
        {
          decoderId: "decoder",
          decoderVersion: "1",
          output: {
            attributes: attributes as Record<string, never>,
          },
          payload: { encoding: "custom" },
        }
      )
    ).resolves.toBeUndefined();
  });

  it("serves byte subranges from block cache fills", async () => {
    const reader: ByteClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({ maxSizeBytes: 128 });
    const client = createCachedByteClient(reader, {
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
    const reader: ByteClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({ maxSizeBytes: 128 });
    const client = createCachedByteClient(reader, {
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

  it("keeps exact reads when source size is unknown", async () => {
    const reader: ByteClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({ maxSizeBytes: 128 });
    const client = createCachedByteClient(reader, {
      blockSizeBytes: 64,
      memory: cache,
    });
    const request = createByteRangeReadRequest({
      range: { length: 4n, offset: 4n },
      source: {
        sourceId: "source:1",
        url: "bytes://source/default",
      },
    });

    await client.readBytes(request);

    expect(reader.readBytes).toHaveBeenCalledWith(request);
  });

  it("uses larger default block fills for explicitly remote sources", async () => {
    const reader: ByteClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({
      maxSizeBytes: DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES * 2,
    });
    const client = createCachedByteClient(reader, { memory: cache });
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
    const reader: ByteClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({
      maxSizeBytes: DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES * 2,
    });
    const client = createCachedByteClient(reader, { memory: cache });
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
      const reader: ByteClient = {
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
      const client = createCachedByteClient(reader, {
        blockSizeBytes,
        memory: cache,
      });

      await client.readBytes(request);

      expect(reader.readBytes).toHaveBeenCalledWith(request);
    }
  });

  it("coalesces in-flight byte cache fills", async () => {
    const reader: ByteClient = {
      readBytes: vi.fn(async (readRequest) => ({
        bytes: bytesForRange(readRequest),
        range: readRequest.range,
        source: readRequest.source,
      })),
    };
    const cache = createMemoryByteRangeCache({ maxSizeBytes: 128 });
    const client = createCachedByteClient(reader, {
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
    const client = createHttpByteClient(extendedFetch);

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

  it("times out hung HTTP byte-range reads", async () => {
    vi.useFakeTimers();
    try {
      const client = createHttpByteClient(
        async <Body, Result>(
          config: FetchFunctionConfig<Body> & { readonly signal?: AbortSignal }
        ): Promise<FetchFunctionResult<Result>> =>
          new Promise((_, reject) => {
            config.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          })
      );
      const read = client.readBytes(createByteRangeReadRequest());
      const rejection = expect(read).rejects.toThrow(
        "HTTP byte-range read timed out"
      );

      await vi.advanceTimersByTimeAsync(30_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
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
    const client = createDecodeClient({
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
    const client = createDecodeClient({
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
    const client = createDecodeClient({
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
  responses: Readonly<Record<string, ArrayBufferLike>>,
  options: { readonly head?: "missing" | "fail" } = {}
): {
  calls: FetchCall[];
  extendedFetch: ExtendedFetchFunction;
} {
  const calls: FetchCall[] = [];
  const extendedFetch: ExtendedFetchFunction = async <Body, Result>(
    config: FetchFunctionConfig<Body> & { readonly signal?: AbortSignal }
  ): Promise<FetchFunctionResult<Result>> => {
    const { body, headers, method, path, result, signal } = config;
    calls.push({ body, headers, method, path, result, signal });

    const response = responses[path];
    if (!response) {
      throw new Error(`No mock response for ${path}`);
    }

    if (method === "HEAD") {
      if (options.head === "fail") {
        throw new Error(`Mock HEAD failed for ${path}`);
      }

      return {
        headers:
          options.head === "missing"
            ? new Headers()
            : new Headers({
                "Content-Length": response.byteLength.toString(),
              }),
        response: new ArrayBuffer(0) as Result,
      };
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
