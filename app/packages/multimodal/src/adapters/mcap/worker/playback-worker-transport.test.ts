import { describe, expect, it, vi } from "vitest";
import { EPISODE_READ_CANCELLED_MESSAGE } from "../../../ports";
import { McapPlaybackWorkerTransport } from "./playback-worker-transport";

describe("MCAP playback worker transport", () => {
  it("forwards transport progress without settling pending requests", async () => {
    const worker = createWorker();
    const onTransport = vi.fn();
    const transport = new McapPlaybackWorkerTransport(() => true, onTransport);
    const request = transport.request(worker, "source:1", "readTimelineRange", {
      source: createSource(),
    });
    const snapshot = {
      busyMs: 100,
      capturedAtMs: 200,
      fetchedBytes: 1_000,
      reads: 1,
    };

    transport.handleResponse({
      ok: true,
      transport: snapshot,
      type: "transport",
    });

    expect(onTransport).toHaveBeenCalledWith(snapshot);
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

  it("cancels matching pending unary requests locally", async () => {
    const worker = createWorker();
    const transport = new McapPlaybackWorkerTransport(() => true);
    const batch = transport.request(
      worker,
      "source:1",
      "readSynchronizedMessageBatch",
      { activeTimeline: "log", source: createSource(), timeNs: [], topics: [] },
    );
    const topics = transport.request(worker, "source:1", "readTopics", {
      source: createSource(),
    });

    const cancelledIds = transport.cancelPending(
      (pending) => pending.type === "readSynchronizedMessageBatch",
    );

    expect(cancelledIds).toEqual([1]);
    await expect(batch).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);

    // A late worker response for the cancelled id is ignored, and the
    // untouched request still settles normally.
    transport.handleResponse({ error: "late failure", id: 1, ok: false });
    transport.handleResponse({ id: 2, ok: true, result: [] });
    await expect(topics).resolves.toEqual([]);
  });

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

  it("cancels pending streams locally and reports their ids", async () => {
    const worker = createWorker();
    const transport = new McapPlaybackWorkerTransport(() => true);
    const stream = transport.stream(worker, "source:1", "readDecodedMessages", {
      source: createSource(),
      topics: ["/camera"],
    });
    const next = stream.next();

    const cancelledIds = transport.cancelStreams();

    expect(cancelledIds).toEqual([1]);
    await expect(next).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);

    // A late worker response for the cancelled stream is ignored.
    transport.handleResponse({
      done: false,
      id: 1,
      item: createDecodedMessage(),
      ok: true,
      stream: true,
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

  it("yields batched worker stream items in order", async () => {
    const worker = createWorker();
    const transport = new McapPlaybackWorkerTransport(() => true);
    const stream = transport.stream(worker, "source:1", "readDecodedMessages", {
      source: createSource(),
      topics: ["/diagnostics"],
    });
    const firstMessage = createDecodedMessage(1n);
    const secondMessage = createDecodedMessage(2n);
    const first = stream.next();

    transport.handleResponse({
      done: false,
      id: 1,
      items: [firstMessage, secondMessage],
      ok: true,
      stream: true,
    });

    await expect(first).resolves.toEqual({
      done: false,
      value: firstMessage,
    });
    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: secondMessage,
    });

    const done = stream.next();
    transport.handleResponse({
      done: true,
      id: 1,
      ok: true,
      stream: true,
    });
    await expect(done).resolves.toEqual({ done: true, value: undefined });
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

function createDecodedMessage(timeNs = 1n) {
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
    logTimeNs: timeNs,
    publishTimeNs: timeNs,
    sequence: 1,
    timelineTimeNs: timeNs,
    topic: "/camera",
  };
}
