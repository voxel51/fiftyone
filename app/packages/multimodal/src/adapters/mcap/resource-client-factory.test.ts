import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ByteClient } from "../../query/bytes/index";
import {
  acquireSharedMcapResourceClient,
  createMcapResourceClient,
} from "./resource-client-factory";

const workerHarness = vi.hoisted(() => {
  const workerClient = {
    dispose: vi.fn(),
    releaseRetainedResources: vi.fn(),
    readDecodedMessages: vi.fn(async function* () {
      for (const item of [] as never[]) {
        yield item;
      }
    }),
    readFrameTransformBootstrap: vi.fn(),
    readFrameTransformWindow: vi.fn(),
    readSynchronizedMessageBatch: vi.fn(),
    readSynchronizedMessages: vi.fn(),
    readTopics: vi.fn(),
    readTimelineRange: vi.fn(),
  };

  return {
    createWorkerMcapResourceClient: vi.fn(() => workerClient),
    workerClient,
  };
});

vi.mock("./worker-host/index", () => ({
  createWorkerMcapResourceClient: workerHarness.createWorkerMcapResourceClient,
}));

describe("MCAP resource worker option", () => {
  beforeEach(() => {
    workerHarness.createWorkerMcapResourceClient.mockClear();
    workerHarness.workerClient.dispose.mockClear();
    workerHarness.workerClient.releaseRetainedResources.mockClear();
  });

  it("creates the inline client by default", () => {
    const client = createMcapResourceClient();

    expect(workerHarness.createWorkerMcapResourceClient).not.toHaveBeenCalled();

    client.dispose();
  });

  it("creates the worker-backed client when requested", () => {
    const client = createMcapResourceClient({ worker: true });

    expect(client).toBe(workerHarness.workerClient);
    expect(workerHarness.createWorkerMcapResourceClient).toHaveBeenCalledTimes(
      1,
    );
  });

  it("uses inline mode when a custom byte client is provided", () => {
    const byteClient = { readBytes: vi.fn() } as unknown as ByteClient;
    const client = createMcapResourceClient({ byteClient, worker: true });

    expect(workerHarness.createWorkerMcapResourceClient).not.toHaveBeenCalled();

    client.dispose();
  });
});

describe("acquireSharedMcapResourceClient", () => {
  beforeEach(() => {
    workerHarness.workerClient.releaseRetainedResources.mockClear();
  });

  it("shares one client across holders and disposes after the linger window", () => {
    vi.useFakeTimers();
    try {
      const first = acquireSharedMcapResourceClient({ worker: true });
      const second = acquireSharedMcapResourceClient({ worker: true });
      expect(second.client).toBe(first.client);

      first.release();
      expect(
        workerHarness.workerClient.releaseRetainedResources,
      ).not.toHaveBeenCalled();
      second.release();
      expect(
        workerHarness.workerClient.releaseRetainedResources,
      ).toHaveBeenCalledTimes(1);
      // Still lingering: a fast grid round trip must find the fleet warm.
      expect(first.client.dispose).not.toHaveBeenCalled();

      // Re-acquiring within the linger window cancels disposal.
      const third = acquireSharedMcapResourceClient({ worker: true });
      vi.advanceTimersByTime(60_000);
      expect(first.client.dispose).not.toHaveBeenCalled();
      expect(third.client).toBe(first.client);

      third.release();
      expect(
        workerHarness.workerClient.releaseRetainedResources,
      ).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(60_000);
      expect(first.client.dispose).toHaveBeenCalledTimes(1);

      // The next acquire after disposal builds a fresh client.
      const fourth = acquireSharedMcapResourceClient({ worker: true });
      expect(fourth.client).toBeDefined();
      fourth.release();
      vi.advanceTimersByTime(60_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores duplicate releases from one holder", () => {
    vi.useFakeTimers();
    try {
      const first = acquireSharedMcapResourceClient({ worker: true });
      const second = acquireSharedMcapResourceClient({ worker: true });
      // The hoisted harness reuses one client spy across tests.
      vi.mocked(first.client.dispose).mockClear();
      first.release();
      first.release();
      vi.advanceTimersByTime(60_000);
      // The second holder still owns the client.
      expect(second.client.dispose).not.toHaveBeenCalled();
      second.release();
      vi.advanceTimersByTime(60_000);
      expect(second.client.dispose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
