import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithLinearBackoff } from "./decorated-fetch";

describe("fetchWithLinearBackoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("should return response when fetch succeeds on first try", async () => {
    const mockResponse = new Response("Success", { status: 200 });
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const response = await fetchWithLinearBackoff("http://fiftyone.ai");

    expect(response).toBe(mockResponse);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("http://fiftyone.ai");
  });

  it("should retry when fetch fails and eventually succeed", async () => {
    const mockResponse = new Response("Success", { status: 200 });
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValue(mockResponse);

    const response = await fetchWithLinearBackoff("http://fiftyone.ai");

    expect(response).toBe(mockResponse);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("should throw an error after max retries when fetch fails every time", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));

    await expect(
      fetchWithLinearBackoff("http://fiftyone.ai", 3, 10)
    ).rejects.toThrowError(new RegExp("Max retries for fetch reached"));

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("should throw an error when response is not ok", async () => {
    const mockResponse = new Response("Not Found", { status: 500 });
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(
      fetchWithLinearBackoff("http://fiftyone.ai", 5, 10)
    ).rejects.toThrow("HTTP error: 500");

    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  it("should throw an error when response is a 4xx, like 404", async () => {
    const mockResponse = new Response("Not Found", { status: 404 });
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(
      fetchWithLinearBackoff("http://fiftyone.ai", 5, 10)
    ).rejects.toThrow("Non-retryable HTTP error: 404");

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("should apply linear backoff between retries", async () => {
    const mockResponse = new Response("Success", { status: 200 });
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValue(mockResponse);

    vi.useFakeTimers();

    const fetchPromise = fetchWithLinearBackoff("http://fiftyone.ai", 5, 10);

    // advance timers to simulate delays
    // after first delay
    await vi.advanceTimersByTimeAsync(100);
    // after scond delay
    await vi.advanceTimersByTimeAsync(200);

    const response = await fetchPromise;

    expect(response).toBe(mockResponse);
    expect(global.fetch).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});
