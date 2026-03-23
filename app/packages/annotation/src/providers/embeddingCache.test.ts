import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEmbedding,
  putEmbedding,
  _resetMemoryCache,
  MAX_CACHE_ENTRIES,
  type CachedEmbedding,
} from "./embeddingCache";

function createMockIDB(options?: { failOn?: "get" | "put" }) {
  const { failOn } = options ?? {};
  const store = new Map<string, CachedEmbedding>();
  const closeSpy = vi.fn();

  const mockObjectStore = () => ({
    get: (key: string) => {
      const req = {
        result: undefined as CachedEmbedding | undefined,
        onsuccess: null as any,
        onerror: null as any,
        error: failOn === "get" ? new Error("read failed") : null,
      };
      setTimeout(() => {
        if (failOn === "get") { req.onerror?.(); }
        else { req.result = store.get(key); req.onsuccess?.(); }
      });
      return req;
    },
    put: (value: CachedEmbedding, key: string) => { if (failOn !== "put") store.set(key, value); },
    delete: (key: string) => { store.delete(key); },
    getAllKeys: () => {
      const req = { result: [] as string[], onsuccess: null as any, onerror: null as any };
      setTimeout(() => { req.result = [...store.keys()]; req.onsuccess?.(); });
      return req;
    },
  });

  const mockDB = {
    transaction: (_store?: string, mode?: string) => {
      const os = mockObjectStore();
      const shouldFailPut = failOn === "put" && mode === "readwrite";
      const tx = {
        objectStore: () => os,
        onerror: null as any,
        error: shouldFailPut ? new Error("write failed") : null,
        set oncomplete(fn: any) {
          if (!shouldFailPut)
            setTimeout(() => fn?.());
        },
      };

      if (shouldFailPut)
        setTimeout(() => tx.onerror?.());

      return tx;
    },
    createObjectStore: () => {},
    close: closeSpy,
  };

  const openSpy = vi.fn(() => {
    const req = { result: mockDB, onupgradeneeded: null as any, onsuccess: null as any, onerror: null as any };
    setTimeout(() => { req.onupgradeneeded?.(); req.onsuccess?.(); });
    return req;
  });

  const mockIndexedDB = { open: openSpy };

  return { store, mockIndexedDB, closeSpy, openSpy };
}

function createTestEmbedding(seed = 51): CachedEmbedding {
  return {
    imageEmbed: { data: new Float32Array([seed, seed + 1]), dims: [1, 2] },
    highResFeats0: { data: new Float32Array([seed + 2]), dims: [1, 1] },
    highResFeats1: { data: new Float32Array([seed + 3]), dims: [1, 1] },
    processedImage: { originalWidth: 640, originalHeight: 480, scale: 1.6, padX: 12, padY: 56 },
    lastAccessed: 0,
  };
}

const TEST_URL = "https://example.com/image.jpg";

describe("embeddingCache", () => {
  let closeSpy: ReturnType<typeof vi.fn>;
  let openSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetMemoryCache();
    const idb = createMockIDB();
    closeSpy = idb.closeSpy;
    openSpy = idb.openSpy;
    vi.stubGlobal("indexedDB", idb.mockIndexedDB);
  });

  it("Returns undefined on cache miss", async () => {
    const result = await getEmbedding(TEST_URL);

    expect(result).toBeUndefined();
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("Returns embedding from memory on cache hit", async () => {
    const embedding = createTestEmbedding();
    await putEmbedding(TEST_URL, embedding);
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);

    const result = await getEmbedding(TEST_URL);
    expect(result).toBe(embedding);

    // Let fire-and-forget IDB timestamp write settle
    await new Promise((r) => setTimeout(r, 10));

    // Memory hit opens IDB once to persist lastAccessed
    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(closeSpy).toHaveBeenCalledTimes(2);
  });

  it("Falls back to IndexedDB when memory is empty", async () => {
    const embedding = createTestEmbedding();
    await putEmbedding(TEST_URL, embedding);
    _resetMemoryCache();

    const result = await getEmbedding(TEST_URL);

    expect(result?.processedImage).toEqual(embedding.processedImage);
    // put opened IDB once + get opened IDB once
    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(closeSpy).toHaveBeenCalledTimes(2);
  });

  it("Evicts oldest entry when over MAX_CACHE_ENTRIES", async () => {
    for (let i = 0; i <= MAX_CACHE_ENTRIES; i++)
      await putEmbedding(`https://example.com/${i}.jpg`, createTestEmbedding(i));

    // Clear memory so gets fall through to IDB, where entry 0 was also evicted
    _resetMemoryCache();
    const evicted = await getEmbedding("https://example.com/0.jpg");
    const kept = await getEmbedding("https://example.com/1.jpg");

    expect(evicted).toBeUndefined();
    expect(kept).toBeDefined();
    expect(openSpy).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 1 + 2);
    expect(closeSpy).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 1 + 2);
  });

  it("Preserves prior-session IDB entries after reload and new write", async () => {
    // Seed MAX_CACHE_ENTRIES entries (simulates a prior session)
    for (let i = 0; i < MAX_CACHE_ENTRIES; i++)
      await putEmbedding(`https://example.com/${i}.jpg`, createTestEmbedding(i));

    // Simulate page reload: memory is empty, IDB still has all entries
    _resetMemoryCache();

    // Write one new entry: it should evict only the oldest, not all prior entries
    await putEmbedding("https://example.com/new.jpg", createTestEmbedding(99));

    // Entry 0 is oldest, gets evicted. Entries 1-4 + new should survive.
    _resetMemoryCache();

    const evicted = await getEmbedding("https://example.com/0.jpg");
    expect(evicted).toBeUndefined();

    for (let i = 1; i < MAX_CACHE_ENTRIES; i++) {
      const kept = await getEmbedding(`https://example.com/${i}.jpg`);
      expect(kept).toBeDefined();
    }

    const newEntry = await getEmbedding("https://example.com/new.jpg");
    expect(newEntry).toBeDefined();
  });

  it("Memory hit updates IDB timestamp so hot entries survive eviction", async () => {
    // Fill cache
    for (let i = 0; i < MAX_CACHE_ENTRIES; i++)
      await putEmbedding(`https://example.com/${i}.jpg`, createTestEmbedding(i));

    // Touch entry 0 from memory (updates its IDB lastAccessed)
    await getEmbedding("https://example.com/0.jpg");
  
    // Let the fire-and-forget IDB write settle
    await new Promise((r) => setTimeout(r, 10));

    // Add a new entry which should evict entry 1 (oldest untouched), not entry 0
    await putEmbedding("https://example.com/new.jpg", createTestEmbedding(99));

    _resetMemoryCache();
    const hot = await getEmbedding("https://example.com/0.jpg");
    const evicted = await getEmbedding("https://example.com/1.jpg");

    expect(hot).toBeDefined();
    expect(evicted).toBeUndefined();
  });

  it.each([
    { name: "open fails on get", failOn: undefined, op: "get" as const, warning: "Embedding cache open failed: Error: blocked" },
    { name: "open fails on put", failOn: undefined, op: "put" as const, warning: "Embedding cache open failed: Error: blocked" },
    { name: "idbGet fails", failOn: "get" as const, op: "get" as const, warning: "Embedding cache read failed: Error: read failed" },
    { name: "idbPut fails", failOn: "put" as const, op: "put" as const, warning: "Embedding cache write failed: Error: write failed" },
  ])("Warns and falls through when $name", async ({ failOn, op, warning }) => {
    if (failOn) {
      const idb = createMockIDB({ failOn });
      vi.stubGlobal("indexedDB", idb.mockIndexedDB);
    } else {
      vi.stubGlobal("indexedDB", { open: () => { throw new Error("blocked"); } });
    }
    const onWarning = vi.fn();

    if (op === "get") {
      const result = await getEmbedding(TEST_URL, onWarning);
      expect(result).toBeUndefined();
    } else {
      await putEmbedding(TEST_URL, createTestEmbedding(), onWarning);
    }

    expect(onWarning).toHaveBeenCalledWith(warning);
  });

  it("IDB handle is closed on all paths", async () => {
    await putEmbedding(TEST_URL, createTestEmbedding());
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);

    await getEmbedding("https://example.com/miss.jpg");
    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(closeSpy).toHaveBeenCalledTimes(2);

    _resetMemoryCache();
    await getEmbedding(TEST_URL);
    expect(openSpy).toHaveBeenCalledTimes(3);
    expect(closeSpy).toHaveBeenCalledTimes(3);
  });
});
