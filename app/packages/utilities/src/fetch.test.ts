import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFetchFunction,
  getFetchFunctionExtended,
  setFetchFunction,
  type BrowserCacheMode,
} from "./fetch";

describe("fetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("Content-Type header", () => {
    it("should set Content-Type to application/json when body is provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      setFetchFunction("http://localhost");
      await getFetchFunction()("POST", "/test", { data: "value" }, "json", 0);

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers["Content-Type"]).toBe("application/json");
    });

    it("should not set Content-Type when body is not provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      setFetchFunction("http://localhost");
      await getFetchFunction()("DELETE", "/test", null, "json", 0);

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers["Content-Type"]).toBeUndefined();
    });
  });

  it("forwards external abort signals", async () => {
    const mockFetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    vi.stubGlobal("fetch", mockFetch);
    setFetchFunction("http://localhost");
    const controller = new AbortController();
    const request = getFetchFunctionExtended()({
      method: "GET",
      path: "/test",
      result: "arrayBuffer",
      retries: 0,
      signal: controller.signal,
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(mockFetch.mock.calls[0]?.[1].signal).toBe(controller.signal);
  });

  it("reports streamed array-buffer progress", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream, { status: 200 })),
    );
    setFetchFunction("http://localhost");
    const onProgress = vi.fn();

    const result = await getFetchFunctionExtended()<undefined, ArrayBuffer>({
      method: "GET",
      onProgress,
      path: "/test",
      result: "arrayBuffer",
      retries: 0,
    });

    expect(new Uint8Array(result.response)).toEqual(new Uint8Array([1, 2, 3]));
    expect(onProgress.mock.calls.map(([loaded]) => loaded)).toEqual([0, 2, 3]);
  });

  it("returns an unconsumed response when requested", async () => {
    const response = new Response("stream me", { status: 200 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );
    setFetchFunction("http://localhost");

    const result = await getFetchFunctionExtended()<undefined, Response>({
      method: "GET",
      path: "/test",
      result: "response",
      retries: 0,
    });

    expect(result.response).toBe(response);
    await expect(result.response.text()).resolves.toBe("stream me");
  });

  it("does not cache non-replayable responses", async () => {
    const mockFetch = vi.fn(async () => new Response("stream me"));
    vi.stubGlobal("fetch", mockFetch);
    setFetchFunction("http://localhost");

    const cachedFetch = getFetchFunction({ cache: true });
    const basicResponses = await Promise.all([
      cachedFetch<undefined, Response>(
        "GET",
        "/basic",
        undefined,
        "response",
        0,
      ),
      cachedFetch<undefined, Response>(
        "GET",
        "/basic",
        undefined,
        "response",
        0,
      ),
    ]);
    const extendedResponses = await Promise.all([
      getFetchFunctionExtended()<undefined, Response>({
        cache: true,
        method: "GET",
        path: "/extended",
        result: "response",
        retries: 0,
      }),
      getFetchFunctionExtended()<undefined, Response>({
        cache: true,
        method: "GET",
        path: "/extended",
        result: "response",
        retries: 0,
      }),
    ]);

    await expect(
      Promise.all([
        ...basicResponses.map((response) => response.text()),
        ...extendedResponses.map(({ response }) => response.text()),
      ]),
    ).resolves.toEqual(["stream me", "stream me", "stream me", "stream me"]);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("rejects the only-if-cached browser cache mode at compile time", () => {
    // Every request is sent with mode "cors", where the Request constructor
    // throws on "only-if-cached" — the type must not admit it
    // @ts-expect-error -- excluded from BrowserCacheMode
    const invalid: BrowserCacheMode = "only-if-cached";
    void invalid;

    const valid: BrowserCacheMode = "no-store";
    expect(valid).toBe("no-store");
  });
});
