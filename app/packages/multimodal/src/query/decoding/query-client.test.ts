import { describe, expect, it, vi } from "vitest";
import type { Decoder } from "../../decoders";
import { DecoderRegistry } from "../../decoders";
import { VISUALIZATION_KIND } from "../../visualization";
import {
  createDecodeClient,
  createMemoryDecodedOutputCache,
  type DecodeExecutor,
} from "./index";

describe("decoded query client", () => {
  it("uses decoded cache hits without re-running decoders", async () => {
    const { decoder, payload, registry } = createDecoderFixture();
    const client = createDecodeClient({
      cache: createMemoryDecodedOutputCache({ maxSizeBytes: 128 }),
      registry,
    });
    const request = {
      bytes: new Uint8Array([1]),
      cache: {
        recordId: "record-1",
        source: testSource,
        streamId: "stream-1",
      },
      context: { streamId: "stream-1" },
      payload,
    };

    await client.decode(request);
    await client.decode({ ...request, bytes: new Uint8Array([2]) });

    expect(decoder.decode).toHaveBeenCalledTimes(1);
  });

  it("skips cache lookups entirely for declared-noop decoded caches", async () => {
    const { decoder, payload, registry } = createDecoderFixture();
    const cache = {
      clear: vi.fn(() => Promise.resolve()),
      enabled: false,
      get: vi.fn(() => Promise.resolve(undefined)),
      put: vi.fn(() => Promise.resolve()),
    };
    const client = createDecodeClient({ cache, registry });

    expect(client.cachesDecodedOutput).toBe(false);

    const request = {
      bytes: new Uint8Array([1]),
      cache: {
        recordId: "record-1",
        source: testSource,
        streamId: "stream-1",
      },
      context: { streamId: "stream-1" },
      payload,
    };
    await client.decode(request);
    await client.decode(request);

    expect(decoder.decode).toHaveBeenCalledTimes(2);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("allows decode execution to be injected for worker-backed hot paths", async () => {
    const { decoder, payload, registry } = createDecoderFixture();
    const executor: DecodeExecutor = {
      decode: vi.fn<DecodeExecutor["decode"]>(
        ({ bytes, context, decoder: activeDecoder }) =>
          activeDecoder.decode(bytes, context),
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
      }),
    ).rejects.toThrow("No decoder registered");
  });
});

const testSource = {
  sizeBytes: "128",
  sourceId: "source:1",
  url: "bytes://source/default",
};

function createDecoderFixture() {
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
  return { decoder, payload, registry };
}
