import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMcapResourceClient } from "./resource-client";

const workerHarness = vi.hoisted(() => {
  const workerClient = {
    dispose: vi.fn(),
    readDecodedMessages: vi.fn(async function* () {
      for (const item of [] as never[]) {
        yield item;
      }
    }),
    readSynchronizedMessageBatch: vi.fn(),
    readSynchronizedMessages: vi.fn(),
    readStaticTransforms: vi.fn(),
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
      1
    );
  });
});
