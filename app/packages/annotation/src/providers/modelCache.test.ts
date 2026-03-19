import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadModelWeights, MAX_RETRIES } from "./modelCache";

// Minimal in-memory IndexedDB mock
function createMockIDB() {
  const store = new Map<string, ArrayBuffer>();

  const mockObjectStore = () => ({
    get: (key: string) => {
      const req = { result: undefined as ArrayBuffer | undefined, onsuccess: null as any, onerror: null as any };
      setTimeout(() => { req.result = store.get(key); req.onsuccess?.(); });
      return req;
    },
    put: (value: ArrayBuffer, key: string) => { store.set(key, value); },
  });

  const mockDB = {
    transaction: () => {
      const os = mockObjectStore();
      return {
        objectStore: () => os,
        onerror: null as any,
        set oncomplete(fn: any) {
          setTimeout(() => fn?.());
        },
      };
    },
    createObjectStore: () => {},
    close: () => {},
  };

  const mockIndexedDB = {
    open: () => {
      const req = { result: mockDB, onupgradeneeded: null as any, onsuccess: null as any, onerror: null as any };
      setTimeout(() => { req.onupgradeneeded?.(); req.onsuccess?.(); });
      return req;
    },
  };

  return { store, mockIndexedDB };
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
const TEST_BUFFER = new ArrayBuffer(64);

describe("loadModelWeights", () => {
  let store: Map<string, ArrayBuffer>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    const idb = createMockIDB();
    store = idb.store;
    vi.stubGlobal("indexedDB", idb.mockIndexedDB);
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(TEST_BUFFER));
  });

  it("Downloads and returns buffer on cache miss", async () => {
    const result = await loadModelWeights(TEST_URL);

    expect(result.byteLength).toBe(64);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("Returns cached buffer without fetching on cache hit", async () => {
    store.set(TEST_URL, TEST_BUFFER);

    const result = await loadModelWeights(TEST_URL);

    expect(result.byteLength).toBe(64);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("Calls onProgress with full size on cache hit", async () => {
    store.set(TEST_URL, TEST_BUFFER);
    const onProgress = vi.fn();

    await loadModelWeights(TEST_URL, onProgress);

    expect(onProgress).toHaveBeenCalledWith(64, 64);
  });

  it("Streams progress via onProgress on cache miss", async () => {
    const chunk1 = new Uint8Array([1, 2, 3]);
    const chunk2 = new Uint8Array([4, 5]);
    global.fetch = vi.fn().mockResolvedValue(mockStreamingResponse([chunk1, chunk2]));
    const onProgress = vi.fn();

    const result = await loadModelWeights(TEST_URL, onProgress);

    expect(result.byteLength).toBe(5);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 3, 5);
    expect(onProgress).toHaveBeenNthCalledWith(2, 5, 5);
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

    const result = await loadModelWeights(TEST_URL, onProgress);

    expect(result.byteLength).toBe(64);
    if (onProgress)
      expect(onProgress).not.toHaveBeenCalled();
  });

  it("Throws on 4xx without retrying", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(new ArrayBuffer(0), 404));

    await expect(loadModelWeights(TEST_URL)).rejects.toThrow("404");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("Retries on 5xx and eventually succeeds", async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(mockFetchResponse(new ArrayBuffer(0), 500))
      .mockResolvedValue(mockFetchResponse(TEST_BUFFER));

    const promise = loadModelWeights(TEST_URL);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.byteLength).toBe(64);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("Retries on network error and eventually succeeds", async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValue(mockFetchResponse(TEST_BUFFER));

    const promise = loadModelWeights(TEST_URL);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.byteLength).toBe(64);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("Falls through to fetch and warns when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("blocked"); } });
    const onWarning = vi.fn();

    const result = await loadModelWeights(TEST_URL, undefined, onWarning);

    expect(result.byteLength).toBe(64);
    expect(onWarning).toHaveBeenCalledWith("IndexedDB open failed, downloading instead: Error: blocked");
  });

  it("Throws after all retries exhausted", async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));

    const promise = loadModelWeights(TEST_URL).catch((e: Error) => e);
    await vi.runAllTimersAsync();
    const err = await promise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Network Error");
    expect(global.fetch).toHaveBeenCalledTimes(MAX_RETRIES);
    vi.useRealTimers();
  });
});
