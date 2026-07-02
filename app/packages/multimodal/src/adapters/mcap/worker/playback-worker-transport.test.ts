import { describe, expect, it, vi } from "vitest";
import { MCAP_READ_CANCELLED_MESSAGE } from "../errors";
import { McapPlaybackWorkerTransport } from "./playback-worker-transport";

describe("MCAP playback worker transport", () => {
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
    await expect(batch).rejects.toThrow(MCAP_READ_CANCELLED_MESSAGE);

    // A late worker response for the cancelled id is ignored, and the
    // untouched request still settles normally.
    transport.handleResponse({ error: "late failure", id: 1, ok: false });
    transport.handleResponse({ id: 2, ok: true, result: [] });
    await expect(topics).resolves.toEqual([]);
  });

  it("reports debug attribution before settling a unary response", async () => {
    const worker = createWorker();
    const onAttribution = vi.fn();
    const transport = new McapPlaybackWorkerTransport(
      () => true,
      onAttribution,
    );
    const request = transport.request(worker, "source:1", "readTimelineRange", {
      source: createSource(),
    });
    const attribution = createAttribution();

    transport.handleResponse({
      debugAttribution: attribution,
      id: 1,
      ok: true,
      result: {
        activeTimeline: "log",
        endTimeNs: 2n,
        startTimeNs: 1n,
      },
    });

    expect(onAttribution).toHaveBeenCalledWith(attribution);
    await expect(request).resolves.toEqual({
      activeTimeline: "log",
      endTimeNs: 2n,
      startTimeNs: 1n,
    });
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
    await expect(next).rejects.toThrow(MCAP_READ_CANCELLED_MESSAGE);

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
});

function createWorker(): Worker {
  return {
    postMessage: vi.fn(),
  } as unknown as Worker;
}

function createAttribution() {
  return {
    chunkBytes: 0,
    chunkMessageIndexOverlapBytes: 0,
    chunkOverlapBytes: 0,
    chunksTouched: 0,
    coalescedReadRequests: 0,
    coalescedRequestedBytes: 0,
    decodedPayloadBytes: 0,
    fetchedBytes: 0,
    lane: "foreground" as const,
    ok: true,
    operation: "readTimelineRange",
    payloadBytes: 0,
    priority: 0,
    queueDepthAtStart: 0,
    queueWaitMs: 0,
    rawPayloadBytes: 0,
    readRequests: 0,
    request: {},
    requestedBytes: 0,
    requestId: 1,
    resultItems: 1,
    resultMessages: 0,
    resultSamples: 0,
    resultWindows: 0,
    runMs: 1,
    sourceKey: "source:1",
    topChunks: [],
    transferables: 0,
  };
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
