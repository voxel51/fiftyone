import { describe, expect, it } from "vitest";
import { createCacheApiByteRangeCache } from "./cache-api-byte-cache";
import type {
  ByteRangeReadRequest,
  ByteRangeReadResult,
  ByteSourceDescriptor,
} from "./types";

describe("createCacheApiByteRangeCache", () => {
  it("returns undefined when the runtime has no Cache API", () => {
    expect(createCacheApiByteRangeCache()).toBeUndefined();
  });

  it("round-trips a stored range by content identity", async () => {
    const cache = createCache();
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await cache.put(result({ bytes, offset: 100n }));
    const hit = await cache.get(request({ length: 4n, offset: 100n }));

    expect(hit?.bytes).toEqual(bytes);
    expect(hit?.range).toEqual({ length: 4n, offset: 100n });
  });

  it("hits across access-url rotation for the same source id", async () => {
    const cache = createCache();
    await cache.put(
      result({
        bytes: new Uint8Array([9, 9]),
        offset: 0n,
        source: source({ url: "https://signed.example/a?token=1" }),
      }),
    );

    const hit = await cache.get(
      request({
        length: 2n,
        offset: 0n,
        source: source({ url: "https://signed.example/a?token=2" }),
      }),
    );

    expect(hit?.bytes).toEqual(new Uint8Array([9, 9]));
  });

  it("misses when the discovered source size changes", async () => {
    const cache = createCache();
    await cache.put(
      result({
        bytes: new Uint8Array([5]),
        offset: 0n,
        source: source({ sizeBytes: "1000" }),
      }),
    );

    const hit = await cache.get(
      request({
        length: 1n,
        offset: 0n,
        source: source({ sizeBytes: "2000" }),
      }),
    );

    expect(hit).toBeUndefined();
  });

  it("misses for other sources and other ranges", async () => {
    const cache = createCache();
    await cache.put(result({ bytes: new Uint8Array([1]), offset: 0n }));

    expect(
      await cache.get(
        request({
          length: 1n,
          offset: 0n,
          source: source({ sourceId: "other" }),
        }),
      ),
    ).toBeUndefined();
    expect(
      await cache.get(request({ length: 1n, offset: 5n })),
    ).toBeUndefined();
  });

  it("serves entries whose stored validator matches the source etag", async () => {
    const cache = createCache();
    await cache.put(
      result({
        bytes: new Uint8Array([7]),
        offset: 0n,
        source: source({ etag: "abc" }),
      }),
    );

    const hit = await cache.get(
      request({ length: 1n, offset: 0n, source: source({ etag: "abc" }) }),
    );

    expect(hit?.bytes).toEqual(new Uint8Array([7]));
  });

  it("drops entries whose stored validator mismatches the source etag", async () => {
    const cache = createCache();
    await cache.put(
      result({
        bytes: new Uint8Array([7]),
        offset: 0n,
        source: source({ etag: "abc" }),
      }),
    );

    const rewritten = await cache.get(
      request({ length: 1n, offset: 0n, source: source({ etag: "def" }) }),
    );
    expect(rewritten).toBeUndefined();
    // The stale entry is gone even for validator-less follow-up reads.
    expect(
      await cache.get(request({ length: 1n, offset: 0n })),
    ).toBeUndefined();
  });

  it("keeps serving validator-less entries and validator-less requests", async () => {
    const cache = createCache();
    await cache.put(result({ bytes: new Uint8Array([1]), offset: 0n }));
    await cache.put(
      result({
        bytes: new Uint8Array([2]),
        offset: 10n,
        source: source({ etag: "abc" }),
      }),
    );

    // Entry without a stored validator, request with one: pre-discovery
    // write stays servable.
    expect(
      (
        await cache.get(
          request({ length: 1n, offset: 0n, source: source({ etag: "abc" }) }),
        )
      )?.bytes,
    ).toEqual(new Uint8Array([1]));
    // Entry with a validator, request without one: still a hit.
    expect(
      (await cache.get(request({ length: 1n, offset: 10n })))?.bytes,
    ).toEqual(new Uint8Array([2]));
  });

  it("drops truncated entries instead of returning them", async () => {
    const cache = createCache();
    await cache.put(result({ bytes: new Uint8Array([1, 2]), offset: 0n }));

    // Same offset, different length than stored — a shape the byte client
    // never produces, standing in for a corrupted entry.
    const hit = await cache.get(request({ length: 3n, offset: 0n }));

    expect(hit).toBeUndefined();
  });

  it("evicts oldest entries beyond the per-source budget", async () => {
    const cache = createCache({ maxEntriesPerSource: 4 });

    for (let index = 0; index < 8; index += 1) {
      await cache.put(
        result({
          bytes: new Uint8Array([index]),
          offset: BigInt(index) * 10n,
        }),
      );
    }

    expect(
      await cache.get(request({ length: 1n, offset: 0n })),
    ).toBeUndefined();
    expect(
      (await cache.get(request({ length: 1n, offset: 70n })))?.bytes,
    ).toEqual(new Uint8Array([7]));
  });

  it("drops oldest source caches beyond the source budget", async () => {
    const storage = createFakeCacheStorage();
    const first = createCacheApiByteRangeCache({
      cacheStorage: storage,
      maxSources: 2,
    });
    await first?.put(
      result({
        bytes: new Uint8Array([1]),
        offset: 0n,
        source: source({ sourceId: "a" }),
      }),
    );
    await first?.put(
      result({
        bytes: new Uint8Array([2]),
        offset: 0n,
        source: source({ sourceId: "b" }),
      }),
    );

    // A later session opening a third source applies the budget once.
    const second = createCacheApiByteRangeCache({
      cacheStorage: storage,
      maxSources: 2,
    });
    await second?.put(
      result({
        bytes: new Uint8Array([3]),
        offset: 0n,
        source: source({ sourceId: "c" }),
      }),
    );

    expect(
      await second?.get(
        request({ length: 1n, offset: 0n, source: source({ sourceId: "a" }) }),
      ),
    ).toBeUndefined();
    expect(
      (
        await second?.get(
          request({
            length: 1n,
            offset: 0n,
            source: source({ sourceId: "c" }),
          }),
        )
      )?.bytes,
    ).toEqual(new Uint8Array([3]));
  });

  it("clears every cache under its prefix", async () => {
    const cache = createCache();
    await cache.put(result({ bytes: new Uint8Array([1]), offset: 0n }));

    await cache.clear();

    expect(
      await cache.get(request({ length: 1n, offset: 0n })),
    ).toBeUndefined();
  });
});

function createCache(options: { readonly maxEntriesPerSource?: number } = {}) {
  const cache = createCacheApiByteRangeCache({
    cacheStorage: createFakeCacheStorage(),
    ...options,
  });
  if (!cache) {
    throw new Error("expected cache to construct against the fake storage");
  }

  return cache;
}

function source(
  overrides: Partial<ByteSourceDescriptor> = {},
): ByteSourceDescriptor {
  return {
    sizeBytes: "4096",
    sourceId: "sample-1",
    url: "https://example.test/media?filepath=a.mcap",
    ...overrides,
  };
}

function request({
  length,
  offset,
  source: requestSource = source(),
}: {
  readonly length: bigint;
  readonly offset: bigint;
  readonly source?: ByteSourceDescriptor;
}): ByteRangeReadRequest {
  return {
    range: { length, offset },
    source: requestSource,
  };
}

function result({
  bytes,
  offset,
  source: resultSource = source(),
}: {
  readonly bytes: Uint8Array;
  readonly offset: bigint;
  readonly source?: ByteSourceDescriptor;
}): ByteRangeReadResult {
  return {
    bytes,
    range: { length: BigInt(bytes.byteLength), offset },
    source: resultSource,
  };
}

/**
 * Minimal in-memory CacheStorage: insertion-ordered, URL-keyed, enough for
 * the byte-cache contract (open/match/put/delete/keys) including stored
 * response headers.
 */
function createFakeCacheStorage(): CacheStorage {
  const cachesByName = new Map<
    string,
    Map<string, { bytes: Uint8Array; headers: Headers }>
  >();

  const openCache = (name: string): Cache => {
    let entries = cachesByName.get(name);
    if (!entries) {
      entries = new Map();
      cachesByName.set(name, entries);
    }
    const store = entries;

    return {
      async delete(key: RequestInfo | URL) {
        return store.delete(keyUrl(key));
      },
      async keys() {
        return [...store.keys()].map((url) => ({ url }) as unknown as Request);
      },
      async match(key: RequestInfo | URL) {
        const entry = store.get(keyUrl(key));
        if (!entry) {
          return undefined;
        }
        return new Response(entry.bytes.slice(), { headers: entry.headers });
      },
      async put(key: RequestInfo | URL, response: Response) {
        store.set(keyUrl(key), {
          bytes: new Uint8Array(await response.arrayBuffer()),
          headers: response.headers,
        });
      },
    } as unknown as Cache;
  };

  return {
    async delete(name: string) {
      return cachesByName.delete(name);
    },
    async has(name: string) {
      return cachesByName.has(name);
    },
    async keys() {
      return [...cachesByName.keys()];
    },
    async match() {
      return undefined;
    },
    async open(name: string) {
      return openCache(name);
    },
  } as CacheStorage;
}

function keyUrl(key: RequestInfo | URL): string {
  if (typeof key === "string") {
    return key;
  }
  if (key instanceof URL) {
    return key.toString();
  }

  return key.url;
}
