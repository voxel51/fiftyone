import { describe, expect, it } from "vitest";
import { createHttpByteClient } from "./http-byte-client";
import type { ByteRangeReadRequest } from "./types";

function request(
  overrides: Partial<ByteRangeReadRequest> = {},
): ByteRangeReadRequest {
  return {
    range: { length: 8n, offset: 64n },
    source: {
      sourceId: "source-a",
      url: "https://bytes.example/a.mcap",
    },
    ...overrides,
  };
}

/**
 * Fake fetch function answering with a fixed Content-Range window whose
 * body bytes equal their absolute file offset (mod 256), so slicing
 * mistakes surface as wrong values, not just wrong lengths.
 */
function fetchAnswering(rangeStart: number, rangeEnd: number, total = 1000) {
  const calls: { headers?: Record<string, string>; cache?: string }[] = [];
  const fetchFunction = async (config: {
    headers?: Record<string, string>;
    browserCache?: string;
  }) => {
    calls.push({ headers: config.headers, cache: config.browserCache });
    const bytes = new Uint8Array(rangeEnd - rangeStart + 1);
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = (rangeStart + index) % 256;
    }
    return {
      response: bytes.buffer,
      headers: new Headers({
        "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${total}`,
      }),
    };
  };
  return { calls, fetchFunction };
}

describe("createHttpByteClient readBytes", () => {
  it("returns exact-match responses unchanged", async () => {
    const { calls, fetchFunction } = fetchAnswering(64, 71);
    const client = createHttpByteClient(
      fetchFunction as Parameters<typeof createHttpByteClient>[0],
    );

    const result = await client.readBytes(request());

    // The end is INCLUSIVE (offset + length - 1); bytes=64-72 would fetch a
    // ninth byte and every downstream slice would be off by one
    expect(calls[0].headers?.Range).toBe("bytes=64-71");
    expect(result.bytes.byteLength).toBe(8);
    expect([...result.bytes]).toEqual([64, 65, 66, 67, 68, 69, 70, 71]);
  });

  it("slices the requested window from a superset Content-Range response", async () => {
    // Browser HTTP caches can answer a narrow Range request with a stored
    // wider block; this previously threw and wedged streaming in a retry
    // loop against the same cached entry.
    const { fetchFunction } = fetchAnswering(0, 511);
    const client = createHttpByteClient(
      fetchFunction as Parameters<typeof createHttpByteClient>[0],
    );

    const result = await client.readBytes(request());

    expect(result.bytes.byteLength).toBe(8);
    expect([...result.bytes]).toEqual([64, 65, 66, 67, 68, 69, 70, 71]);
    expect(result.range).toEqual({ length: 8n, offset: 64n });
  });

  it.each([
    ["starts after the requested offset", 65, 200],
    ["ends before the requested range", 0, 70],
    ["misses the requested range entirely", 100, 200],
  ])("rejects a response that %s", async (_name, start, end) => {
    const { fetchFunction } = fetchAnswering(start, end);
    const client = createHttpByteClient(
      fetchFunction as Parameters<typeof createHttpByteClient>[0],
    );

    await expect(client.readBytes(request())).rejects.toThrow(
      /Content-Range covering/,
    );
  });

  it("rejects a body whose length disagrees with its Content-Range", async () => {
    const { fetchFunction } = fetchAnswering(0, 511);
    const truncating = async (config: unknown) => {
      const result = await fetchFunction(
        config as Parameters<typeof fetchFunction>[0],
      );
      return { ...result, response: result.response.slice(0, 100) };
    };
    const client = createHttpByteClient(
      truncating as Parameters<typeof createHttpByteClient>[0],
    );

    await expect(client.readBytes(request())).rejects.toThrow(
      /Expected 512 bytes but received 100/,
    );
  });

  it("bypasses the browser HTTP cache on ranged reads", async () => {
    const { calls, fetchFunction } = fetchAnswering(64, 71);
    const client = createHttpByteClient(
      fetchFunction as Parameters<typeof createHttpByteClient>[0],
    );

    await client.readBytes(request());

    expect(calls[0].cache).toBe("no-store");
  });
});
