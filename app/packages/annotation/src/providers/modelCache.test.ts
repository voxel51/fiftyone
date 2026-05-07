import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadModelWeights, MAX_RETRIES } from "./modelCache";

// Minimal in-memory IndexedDB mock
function createMockIDB(options?: { failOn?: "get" | "put" }) {
  const { failOn } = options ?? {};
  const store = new Map<string, ArrayBuffer>();
  const closeSpy = vi.fn();

  const mockObjectStore = () => ({
    get: (key: string) => {
      const req = {
        result: undefined as ArrayBuffer | undefined,
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
    put: (value: ArrayBuffer, key: string) => { if (failOn !== "put") store.set(key, value); },
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

  const mockIndexedDB = {
    open: () => {
      const req = { result: mockDB, onupgradeneeded: null as any, onsuccess: null as any, onerror: null as any };
      setTimeout(() => { req.onupgradeneeded?.(); req.onsuccess?.(); });
      return req;
    },
  };

  return { store, mockIndexedDB, closeSpy };
}

function mockFetchResponse(body: ArrayBuffer, status = 200) {
  return new Response(body, {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "content-length": String(body.byteLength) },
  });
}

function mockStreamingResponse(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    statusText: "OK",
    headers: { "content-length": String(total) },
  });
}

const TEST_URL = "https://example.com/model.onnx";
const TEST_CACHE_KEY = "test:model.onnx";
const TEST_BUFFER = new ArrayBuffer(64);

describe("loadModelWeights", () => {
  let store: Map<string, ArrayBuffer>;
  let closeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    const idb = createMockIDB();
    store = idb.store;
    closeSpy = idb.closeSpy;
    vi.stubGlobal("indexedDB", idb.mockIndexedDB);
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(TEST_BUFFER));
  });

  it("Downloads and returns buffer on cache miss", async () => {
    const result = await loadModelWeights(TEST_URL, TEST_CACHE_KEY);

    expect(result.byteLength).toBe(64);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("Returns cached buffer without fetching on cache hit", async () => {
    store.set(TEST_CACHE_KEY, TEST_BUFFER);

    const result = await loadModelWeights(TEST_URL, TEST_CACHE_KEY);

    expect(result.byteLength).toBe(64);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("Caches downloaded buffer for subsequent calls", async () => {
    await loadModelWeights(TEST_URL, TEST_CACHE_KEY);
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();

    const result = await loadModelWeights(TEST_URL, TEST_CACHE_KEY);

    expect(result.byteLength).toBe(64);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalledTimes(2);
  });

  it("Calls onProgress with full size on cache hit", async () => {
    store.set(TEST_CACHE_KEY, TEST_BUFFER);
    const onProgress = vi.fn();

    await loadModelWeights(TEST_URL, TEST_CACHE_KEY, onProgress);

    expect(onProgress).toHaveBeenCalledWith(64, 64);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("Streams progress via onProgress on cache miss", async () => {
    const chunk1 = new Uint8Array([1, 2, 3]);
    const chunk2 = new Uint8Array([4, 5]);
    global.fetch = vi.fn().mockResolvedValue(mockStreamingResponse([chunk1, chunk2]));
    const onProgress = vi.fn();

    const result = await loadModelWeights(TEST_URL, TEST_CACHE_KEY, onProgress);

    expect(result.byteLength).toBe(5);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 3, 5);
    expect(onProgress).toHaveBeenNthCalledWith(2, 5, 5);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: "no onProgress callback", onProgress: undefined, fetchOverride: undefined },
    { name: "ReadableStream body unavailable", onProgress: vi.fn(), fetchOverride: () => {
      const response = mockFetchResponse(TEST_BUFFER);
      Object.defineProperty(response, "body", { value: null });
      return vi.fn().mockResolvedValue(response);
    }},
    { name: "Content-Length missing", onProgress: vi.fn(), fetchOverride: () =>
      vi.fn().mockResolvedValue(new Response(new Uint8Array(64), { status: 200, statusText: "OK" }))
    },
  ])("Skips streaming: $name", async ({ onProgress, fetchOverride }) => {
    if (fetchOverride)
      global.fetch = fetchOverride();

    const result = await loadModelWeights(TEST_URL, TEST_CACHE_KEY, onProgress);

    expect(result.byteLength).toBe(64);
    if (onProgress)
      expect(onProgress).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("Throws on 4xx without retrying", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(new ArrayBuffer(0), 404));

    await expect(loadModelWeights(TEST_URL, TEST_CACHE_KEY)).rejects.toThrow("404");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: "5xx", mockFetch: () => vi.fn()
      .mockResolvedValueOnce(mockFetchResponse(new ArrayBuffer(0), 500))
      .mockResolvedValue(mockFetchResponse(TEST_BUFFER)) },
    { name: "408 timeout", mockFetch: () => vi.fn()
      .mockResolvedValueOnce(mockFetchResponse(new ArrayBuffer(0), 408))
      .mockResolvedValue(mockFetchResponse(TEST_BUFFER)) },
    { name: "429 throttle", mockFetch: () => vi.fn()
      .mockResolvedValueOnce(mockFetchResponse(new ArrayBuffer(0), 429))
      .mockResolvedValue(mockFetchResponse(TEST_BUFFER)) },
    { name: "network error", mockFetch: () => vi.fn()
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValue(mockFetchResponse(TEST_BUFFER)) },
  ])("Retries on $name and eventually succeeds", async ({ mockFetch }) => {
    vi.useFakeTimers();
    global.fetch = mockFetch();

    const promise = loadModelWeights(TEST_URL, TEST_CACHE_KEY);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.byteLength).toBe(64);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("Retries on fetch timeout and eventually succeeds", async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn()
      .mockImplementationOnce((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }))
      .mockResolvedValue(mockFetchResponse(TEST_BUFFER));

    const promise = loadModelWeights(TEST_URL, TEST_CACHE_KEY);
    await vi.advanceTimersByTimeAsync(61_000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.byteLength).toBe(64);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it.each([
    { name: "idbGet fails", failOn: "get" as const, warning: "IndexedDB cache read failed, downloading instead: Error: read failed" },
    { name: "idbPut fails", failOn: "put" as const, warning: "IndexedDB cache write failed: Error: write failed" },
  ])("Warns and falls through when $name", async ({ failOn, warning }) => {
    const idb = createMockIDB({ failOn });
    vi.stubGlobal("indexedDB", idb.mockIndexedDB);
    const onWarning = vi.fn();

    const result = await loadModelWeights(TEST_URL, TEST_CACHE_KEY, undefined, onWarning);

    expect(result.byteLength).toBe(64);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(onWarning).toHaveBeenCalledWith(warning);
    expect(idb.closeSpy).toHaveBeenCalledTimes(1);
  });

  it("Falls through to fetch and warns when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("blocked"); } });
    const onWarning = vi.fn();

    const result = await loadModelWeights(TEST_URL, TEST_CACHE_KEY, undefined, onWarning);

    expect(result.byteLength).toBe(64);
    expect(onWarning).toHaveBeenCalledWith("IndexedDB open failed, downloading instead: Error: blocked");
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("Retries on truncated response and eventually succeeds", async () => {
    vi.useFakeTimers();
    const truncated = new Response(
      new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(32)); controller.close(); },
      }),
      { status: 200, statusText: "OK", headers: { "content-length": "64" } }
    );
    global.fetch = vi.fn()
      .mockResolvedValueOnce(truncated)
      .mockResolvedValue(mockFetchResponse(TEST_BUFFER));

    const promise = loadModelWeights(TEST_URL, TEST_CACHE_KEY, vi.fn());
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.byteLength).toBe(64);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("Throws after all retries exhausted", async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));

    const promise = loadModelWeights(TEST_URL, TEST_CACHE_KEY).catch((e: Error) => e);
    await vi.runAllTimersAsync();
    const err = await promise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Network Error");
    expect(global.fetch).toHaveBeenCalledTimes(MAX_RETRIES);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("Throws on truncated response after all retries exhausted", async () => {
    vi.useFakeTimers();
    const makeTruncated = () => new Response(
      new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(32)); controller.close(); },
      }),
      { status: 200, statusText: "OK", headers: { "content-length": "64" } }
    );
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(makeTruncated()));

    const promise = loadModelWeights(TEST_URL, TEST_CACHE_KEY, vi.fn()).catch((e: Error) => e);
    await vi.runAllTimersAsync();
    const err = await promise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/Truncated response.*32 of 64/);
    expect(global.fetch).toHaveBeenCalledTimes(MAX_RETRIES);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
