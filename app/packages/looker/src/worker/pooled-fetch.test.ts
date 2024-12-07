import { beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { enqueueFetch } from "./pooled-fetch";

const MAX_CONCURRENT_REQUESTS = 100;

// helper function to create a deferred promise
function createDeferredPromise<T>() {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

describe("enqueueFetch", () => {
  let mockedFetch: Mock;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedFetch = vi.fn();
    global.fetch = mockedFetch;
  });

  it("should return response when fetch succeeds", async () => {
    const mockResponse = new Response("OK", { status: 200 });
    mockedFetch.mockResolvedValue(mockResponse);

    const response = await enqueueFetch({ url: "https://fiftyone.ai" });
    expect(response).toBe(mockResponse);
  });

  it("should process multiple requests in order", async () => {
    const mockResponse1 = new Response("First", { status: 200 });
    const mockResponse2 = new Response("Second", { status: 200 });

    const deferred1 = createDeferredPromise<Response>();
    const deferred2 = createDeferredPromise<Response>();

    mockedFetch
      .mockImplementationOnce(() => deferred1.promise)
      .mockImplementationOnce(() => deferred2.promise);

    const promise1 = enqueueFetch({ url: "https://fiftyone.ai/1" });
    const promise2 = enqueueFetch({ url: "https://fiftyone.ai/2" });

    deferred1.resolve(mockResponse1);

    const response1 = await promise1;
    expect(response1).toBe(mockResponse1);

    deferred2.resolve(mockResponse2);

    const response2 = await promise2;
    expect(response2).toBe(mockResponse2);
  });

  it("should not exceed MAX_CONCURRENT_REQUESTS", async () => {
    const numRequests = MAX_CONCURRENT_REQUESTS + 50;
    const deferredPromises = [];

    for (let i = 0; i < numRequests; i++) {
      const deferred = createDeferredPromise<Response>();
      deferredPromises.push(deferred);
      mockedFetch.mockImplementationOnce(() => deferred.promise);
      enqueueFetch({ url: `https://fiftyone.ai/${i}` });
    }

    // at this point, fetch should have been called MAX_CONCURRENT_REQUESTS times
    expect(mockedFetch).toHaveBeenCalledTimes(MAX_CONCURRENT_REQUESTS);

    // resolve all deferred promises
    deferredPromises.forEach((deferred, index) => {
      deferred.resolve(new Response(`Response ${index}`, { status: 200 }));
    });

    // wait for all promises to resolve
    await Promise.all(deferredPromises.map((dp) => dp.promise));

    // all requests should have been processed
    expect(mockedFetch).toHaveBeenCalledTimes(numRequests);
  });

  it("should reject immediately on non-retryable error", async () => {
    const mockResponse = new Response("Not Found", { status: 404 });
    mockedFetch.mockResolvedValue(mockResponse);

    await expect(enqueueFetch({ url: "https://fiftyone.ai" })).rejects.toThrow(
      "Non-retryable HTTP error: 404"
    );
  });

  it("should retry on retryable errors up to MAX_RETRIES times", async () => {
    const MAX_RETRIES = 3;
    mockedFetch.mockRejectedValue(new Error("Network Error"));

    await expect(
      enqueueFetch({
        url: "https://fiftyone.ai",
        retryOptions: {
          retries: MAX_RETRIES,
          delay: 50,
        },
      })
    ).rejects.toThrow("Max retries for fetch reached");

    expect(mockedFetch).toHaveBeenCalledTimes(MAX_RETRIES);
  });
});
