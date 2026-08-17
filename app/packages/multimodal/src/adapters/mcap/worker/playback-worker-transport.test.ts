import { describe, expect, it, vi } from "vitest";
import { EPISODE_READ_CANCELLED_MESSAGE } from "../../../ports";
import { isMcapBoundedReadCancelledError } from "../reader";
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

  it("aborts an in-flight unary request and notifies the worker", async () => {
    const worker = createWorker();
    const transport = new McapPlaybackWorkerTransport(() => true);
    const controller = new AbortController();
    const request = transport.request(
      worker,
      "source:1",
      "readTimelineRange",
      { source: createSource() },
      undefined,
      [],
      controller.signal,
    );

    controller.abort();

    await expect(request).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      id: 1,
      type: "cancel",
    });
  });

  it("waits for bounded-read partial usage after signalling worker cancellation", async () => {
    const worker = createWorker();
    const transport = new McapPlaybackWorkerTransport(() => true);
    const controller = new AbortController();
    const budget = {
      maxMessages: 10,
      maxSourceBytes: 1_000,
      maxUncompressedBytes: 2_000,
      maxWallTimeMs: 100,
    };
    const request = transport.request(
      worker,
      "source:1",
      "readBoundedMessages",
      {
        absoluteBudget: budget,
        absoluteMaxChunks: 2,
        budget,
        maxChunks: 2,
        source: createSource(),
        topics: ["/camera"],
      },
      undefined,
      [],
      controller.signal,
    );
    const rejected = vi.fn();
    void request.catch(rejected);

    controller.abort();
    await Promise.resolve();

    expect(rejected).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      id: 1,
      type: "cancel",
    });

    const usage = {
      chunksOpened: 1,
      decompressedBytes: 500,
      decompressionCacheHits: 0,
      elapsedMs: 8,
      logicalSourceBytes: 200,
      logicalUncompressedBytes: 500,
      messagesDecoded: 3,
      transferredBytes: 128,
    };
    transport.handleResponse({
      boundedReadCancellation: { usage },
      error: EPISODE_READ_CANCELLED_MESSAGE,
      id: 1,
      ok: false,
    });

    try {
      await request;
      throw new Error("expected bounded read cancellation");
    } catch (error) {
      expect(isMcapBoundedReadCancelledError(error)).toBe(true);
      if (!isMcapBoundedReadCancelledError(error)) {
        throw error;
      }
      expect(error.usage).toEqual(usage);
    }
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

  it("aborts one blocked stream without disturbing a concurrent stream", async () => {
    const worker = createWorker();
    const transport = new McapPlaybackWorkerTransport(() => true);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const removeFirst = vi.spyOn(firstController.signal, "removeEventListener");
    const first = transport.stream(
      worker,
      "source:1",
      "readDecodedMessages",
      { source: createSource(), topics: ["/first"] },
      undefined,
      firstController.signal,
    );
    const second = transport.stream(
      worker,
      "source:1",
      "readDecodedMessages",
      { source: createSource(), topics: ["/second"] },
      undefined,
      secondController.signal,
    );
    const firstNext = first.next();
    const secondNext = second.next();

    firstController.abort();

    await expect(firstNext).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);
    expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, type: "cancel" });
    expect(removeFirst).toHaveBeenCalledWith("abort", expect.any(Function));

    transport.handleResponse({
      done: false,
      id: 1,
      item: createDecodedMessage(1n),
      ok: true,
      stream: true,
    });
    transport.handleResponse({
      done: false,
      id: 2,
      item: createDecodedMessage(2n),
      ok: true,
      stream: true,
    });
    await expect(secondNext).resolves.toEqual({
      done: false,
      value: createDecodedMessage(2n),
    });
    expect(secondController.signal.aborted).toBe(false);
    await second.return(undefined);
  });

  it("does not register or post a pre-aborted stream request", async () => {
    const worker = createWorker();
    const transport = new McapPlaybackWorkerTransport(() => true);
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    controller.abort();

    const next = transport
      .stream(
        worker,
        "source:1",
        "readDecodedMessages",
        { source: createSource(), topics: ["/camera"] },
        undefined,
        controller.signal,
      )
      .next();

    await expect(next).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);
    expect(add).not.toHaveBeenCalled();
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(transport.isIdle()).toBe(true);
  });

  it("does not yield completed worker replies after the consumer aborts between messages", async () => {
    const worker = createWorker();
    const transport = new McapPlaybackWorkerTransport(() => true);
    const controller = new AbortController();
    const stream = transport.stream(
      worker,
      "source:1",
      "readDecodedMessages",
      { source: createSource(), topics: ["/camera"] },
      undefined,
      controller.signal,
    );
    const first = stream.next();
    transport.handleResponse({
      done: false,
      id: 1,
      item: createDecodedMessage(1n),
      ok: true,
      stream: true,
    });
    transport.handleResponse({
      done: false,
      id: 1,
      item: createDecodedMessage(2n),
      ok: true,
      stream: true,
    });
    transport.handleResponse({ done: true, id: 1, ok: true, stream: true });

    await expect(first).resolves.toMatchObject({
      done: false,
      value: { timelineTimeNs: 1n },
    });
    controller.abort();

    await expect(stream.next()).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);
    expect(transport.isIdle()).toBe(true);
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

  it("preserves a worker response batch when requested by the owner", async () => {
    const worker = createWorker();
    const transport = new McapPlaybackWorkerTransport(() => true);
    const stream = transport.stream(
      worker,
      "source:1",
      "readDecodedMessages",
      { source: createSource(), topics: ["/diagnostics"] },
      undefined,
      undefined,
      undefined,
      [],
      true,
    );
    const items = [createDecodedMessage(1n), createDecodedMessage(2n)];
    const next = stream.next();

    transport.handleResponse({
      done: false,
      id: 1,
      items,
      ok: true,
      stream: true,
    });

    await expect(next).resolves.toEqual({ done: false, value: items });
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
