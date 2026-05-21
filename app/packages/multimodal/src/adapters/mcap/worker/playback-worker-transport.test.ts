import { describe, expect, it, vi } from "vitest";
import { McapPlaybackWorkerTransport } from "./playback-worker-transport";

describe("MCAP playback worker transport", () => {
  it("settles unary responses even when the source is inactive", async () => {
    const worker = createWorker();
    const transport = new McapPlaybackWorkerTransport(() => false);
    const request = transport.request(worker, "source:1", "readTimelineRange", {
      source: createSource(),
    });

    transport.handleResponse({
      id: 1,
      ok: true,
      result: {
        activeTimeline: "log",
        endTimeNs: 2n,
        startTimeNs: 1n,
      },
    });

    await expect(request).resolves.toEqual({
      activeTimeline: "log",
      endTimeNs: 2n,
      startTimeNs: 1n,
    });
  });

  it("finishes inactive streams instead of leaving readers pending", async () => {
    const worker = createWorker();
    const transport = new McapPlaybackWorkerTransport(() => false);
    const stream = transport.stream(worker, "source:1", "readDecodedMessages", {
      source: createSource(),
      topics: ["/camera"],
    });
    const next = stream.next();

    transport.handleResponse({
      done: false,
      id: 1,
      item: createDecodedMessage(),
      ok: true,
      stream: true,
    });

    await expect(next).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });
});

function createWorker(): Worker {
  return {
    postMessage: vi.fn(),
  } as unknown as Worker;
}

function createSource() {
  return {
    sourceId: "source:1",
    url: "mcap-source://sample",
  };
}

function createDecodedMessage() {
  return {
    activeTimeline: "log" as const,
    channelId: 1,
    decoded: {
      decoderId: "decoder",
      decoderVersion: "1",
      output: {
        attributes: {},
      },
      payload: {
        encoding: "protobuf",
      },
    },
    logTimeNs: 1n,
    publishTimeNs: 1n,
    sequence: 1,
    timelineTimeNs: 1n,
    topic: "/camera",
  };
}
