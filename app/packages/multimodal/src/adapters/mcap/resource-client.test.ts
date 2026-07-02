import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  acquireSharedMcapResourceClient,
  createMcapResourceClient,
} from "./resource-client";

const workerHarness = vi.hoisted(() => {
  const workerClient = {
    dispose: vi.fn(),
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

vi.mock("./worker", () => ({
  createWorkerMcapResourceClient: workerHarness.createWorkerMcapResourceClient,
}));

describe("MCAP resource worker option", () => {
  beforeEach(() => {
    workerHarness.createWorkerMcapResourceClient.mockClear();
    workerHarness.workerClient.dispose.mockClear();
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
});

describe("acquireSharedMcapResourceClient", () => {
  it("shares one client across holders and disposes after the linger window", () => {
    vi.useFakeTimers();
    try {
      const first = acquireSharedMcapResourceClient({ worker: true });
      const second = acquireSharedMcapResourceClient({ worker: true });
      expect(second.client).toBe(first.client);

      first.release();
      second.release();
      // Still lingering: a fast grid round trip must find the fleet warm.
      expect(first.client.dispose).not.toHaveBeenCalled();

      // Re-acquiring within the linger window cancels disposal.
      const third = acquireSharedMcapResourceClient({ worker: true });
      vi.advanceTimersByTime(60_000);
      expect(first.client.dispose).not.toHaveBeenCalled();
      expect(third.client).toBe(first.client);

      third.release();
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
