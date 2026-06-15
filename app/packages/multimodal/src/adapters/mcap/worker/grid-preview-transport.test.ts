import { describe, expect, it, vi } from "vitest";
import { McapGridPreviewTransport } from "./grid-preview-transport";
import type { McapGridPreviewWorkerRequest } from "./grid-preview-worker-types";

describe("MCAP grid preview transport", () => {
  it("sends flat unary preview requests and resolves responses", async () => {
    const worker = createWorker();
    const transport = new McapGridPreviewTransport();
    const request = transport.request(worker, { source: createSource() });

    expect(worker.messages[0]).toMatchObject({
      id: 1,
      payload: { source: createSource() },
      type: "decodeGridPreview",
    });
    expect(worker.messages[0]).toHaveProperty("sourceKey");

    transport.handleResponse({
      id: 1,
      ok: true,
      result: createResult("empty"),
    });

    await expect(request).resolves.toEqual(createResult("empty"));
  });

  it("cancels pending requests when the abort signal fires", async () => {
    const worker = createWorker();
    const transport = new McapGridPreviewTransport();
    const controller = new AbortController();
    const request = transport.request(
      worker,
      { source: createSource() },
      { signal: controller.signal }
    );

    controller.abort();

    expect(worker.messages.at(-1)).toEqual({ id: 1, type: "cancel" });
    await expect(request).rejects.toThrow("cancelled");

    transport.handleResponse({
      id: 1,
      ok: true,
      result: createResult("ready"),
    });
    await expect(flushPromises()).resolves.toBeUndefined();
  });

  it("rejects all pending work on worker reset", async () => {
    const worker = createWorker();
    const transport = new McapGridPreviewTransport();
    const request = transport.request(worker, { source: createSource() });

    transport.rejectAll("worker crashed");

    await expect(request).rejects.toThrow("worker crashed");
  });
});

function createWorker() {
  const worker = {
    messages: [] as McapGridPreviewWorkerRequest[],
    postMessage: vi.fn((message: McapGridPreviewWorkerRequest) => {
      worker.messages.push(message);
    }),
  };

  return worker as unknown as Worker & {
    readonly messages: McapGridPreviewWorkerRequest[];
  };
}

function createSource() {
  return {
    sourceId: "source:1",
    url: "mcap-source://sample",
  };
}

function createResult(status: "empty" | "ready") {
  return {
    state: {
      error: null,
      frame: null,
      hasPreviewTopics: status === "ready",
      streamTopic: status === "ready" ? "/camera" : null,
      streamTopics: status === "ready" ? ["/camera"] : [],
      status,
    },
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
