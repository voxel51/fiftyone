import { create } from "@bufbuild/protobuf";
import { Quaternion, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { StreamInventorySchema } from "../../../schemas/v1";
import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerRequest,
  type McapPlaybackWorkerResponse,
} from "./playback-worker-types";
import { createWorkerMcapResourceClient } from "./worker-client";
import { dehydrateMcapFrameTransformSet } from "../frame-transforms";
import type { McapFrameTransformSet } from "../frame-transform-types";

vi.mock("@fiftyone/utilities", () => ({
  getFetchParameters: () => ({
    headers: { Authorization: "token" },
    origin: "http://localhost:5151",
    pathPrefix: "/proxy",
  }),
  mergeHeaders: (...headers: readonly Record<string, string>[]) =>
    Object.assign({}, ...headers),
}));

describe("worker-backed MCAP resource client", () => {
  it("initializes the worker and maps resource calls to RPC messages", async () => {
    const { client, workers } = createClientHarness();
    const request = createTimelineRequest();

    const range = client.readTimelineRange(request);
    const worker = workers[0];

    expect(worker.messages[0]).toEqual({
      payload: {
        headers: { Authorization: "token" },
        latencyDebug: false,
        origin: "http://localhost:5151",
        pathPrefix: "/proxy",
      },
      type: "init",
    });
    expect(worker.handlerSnapshots[0]).toEqual({
      hasErrorHandler: true,
      hasMessageHandler: true,
    });
    expect(worker.messages[1]).toMatchObject({
      id: 1,
      payload: request,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      type: "readTimelineRange",
    });

    worker.respond({ id: 1, ok: true, result: createTimelineRange(1n, 2n) });

    await expect(range).resolves.toEqual(createTimelineRange(1n, 2n));
  });

  it("sends topic reads at idle-prefetch priority", async () => {
    const { client, workers } = createClientHarness();
    const request = {
      source: createSource("source:1"),
    };
    const result = [createTopic("/camera")];

    const topics = client.readTopics(request);
    const worker = workers[0];

    expect(worker.messages[1]).toMatchObject({
      id: 1,
      payload: request,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
      type: "readTopics",
    });

    worker.respond({ id: 1, ok: true, result });

    await expect(topics).resolves.toEqual(result);
  });

  it("sends frame transform bootstrap reads at current-frame priority", async () => {
    const { client, workers } = createClientHarness();
    const request = {
      source: createSource("source:1"),
    };
    // What the worker actually produces — real THREE instances. The worker's
    // RPC layer dehydrates these before postMessage; the test simulates that
    // and the structuredClone hop so the receiver exercises real serialization.
    const workerResult: McapFrameTransformSet = {
      samples: [
        {
          childFrameId: "lidar",
          parentFrameId: "map",
          rotation: new Quaternion(0, 0, 0, 1),
          translation: new Vector3(1, 2, 3),
        },
      ],
    };

    const bootstrap = client.readFrameTransformBootstrap(request);
    const worker = workers[0];

    expect(worker.messages[1]).toMatchObject({
      id: 1,
      payload: request,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      type: "readFrameTransformBootstrap",
    });

    worker.respond({
      id: 1,
      ok: true,
      result: structuredClone(dehydrateMcapFrameTransformSet(workerResult)),
    });

    const set = await bootstrap;
    expect(set.samples[0]?.rotation).toBeInstanceOf(Quaternion);
    expect(set.samples[0]?.translation).toBeInstanceOf(Vector3);
    expect(set.samples[0]?.translation.toArray()).toEqual([1, 2, 3]);
  });

  it("sends frame transform windows at placement-frame priority", async () => {
    const { client, workers } = createClientHarness();
    const request = {
      endTimeNs: 20n,
      source: createSource("source:1"),
      startTimeNs: 10n,
    };
    const workerResult: McapFrameTransformSet = { samples: [] };

    const window = client.readFrameTransformWindow(request);
    const worker = workers[0];

    expect(worker.messages[1]).toMatchObject({
      id: 1,
      payload: request,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLACEMENT_FRAME,
      type: "readFrameTransformWindow",
    });

    worker.respond({
      id: 1,
      ok: true,
      result: structuredClone(dehydrateMcapFrameTransformSet(workerResult)),
    });

    await expect(window).resolves.toEqual(workerResult);
  });

  it("can demote frame transform windows to idle-prefetch priority", async () => {
    const { client, workers } = createClientHarness();
    const request = {
      endTimeNs: 20n,
      source: createSource("source:1"),
      startTimeNs: 10n,
    };
    const workerResult: McapFrameTransformSet = { samples: [] };

    const window = client.readFrameTransformWindow(request, {
      priority: "idle",
    });
    const worker = workers[0];

    expect(worker.messages[1]).toMatchObject({
      id: 1,
      payload: request,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
      type: "readFrameTransformWindow",
    });

    worker.respond({
      id: 1,
      ok: true,
      result: structuredClone(dehydrateMcapFrameTransformSet(workerResult)),
    });

    await expect(window).resolves.toEqual(workerResult);
  });

  it("sends playback batches at playback priority", async () => {
    const { client, workers } = createClientHarness();
    const request = {
      timeNs: [1n, 2n],
      source: createSource("source:1"),
      topics: ["/camera"],
    };

    const windows = client.readSynchronizedMessageBatch(request);
    const worker = workers[0];

    expect(worker.messages[1]).toMatchObject({
      id: 1,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH,
      type: "readSynchronizedMessageBatch",
    });

    worker.respond({ id: 1, ok: true, result: [] });

    await expect(windows).resolves.toEqual([]);
  });

  it("can demote speculative playback batches to idle-prefetch priority", async () => {
    const { client, workers } = createClientHarness();
    const request = {
      timeNs: [1n, 2n],
      source: createSource("source:1"),
      topics: ["/camera"],
    };

    const windows = client.readSynchronizedMessageBatch(request, {
      priority: "idle",
    });
    const worker = workers[0];

    expect(worker.messages[1]).toMatchObject({
      id: 1,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
      type: "readSynchronizedMessageBatch",
    });

    worker.respond({ id: 1, ok: true, result: [] });

    await expect(windows).resolves.toEqual([]);
  });

  it("uses a separate foreground worker while idle-prefetch work is pending", async () => {
    const { client, workers } = createClientHarness();
    const source = createSource("source:1");

    const idle = client.readSynchronizedMessageBatch(
      {
        timeNs: [1n, 2n],
        source,
        topics: ["/camera"],
      },
      { priority: "idle" },
    );
    const current = client.readSynchronizedMessages({
      timeNs: 1n,
      source,
      topics: ["/camera"],
    });

    expect(workers).toHaveLength(2);
    expect(workers[0].messages[1]).toMatchObject({
      id: 1,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
      type: "readSynchronizedMessageBatch",
    });
    expect(workers[1].messages[1]).toMatchObject({
      id: 1,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      type: "readSynchronizedMessages",
    });

    const currentWindow = createSynchronizedWindow(1n);
    workers[1].respond({ id: 1, ok: true, result: currentWindow });
    await expect(current).resolves.toEqual(currentWindow);

    workers[0].respond({ id: 1, ok: true, result: [] });
    await expect(idle).resolves.toEqual([]);
  });

  it("resets idle-prefetch work when the active source changes", async () => {
    const { client, workers } = createClientHarness();

    const idle = client.readSynchronizedMessageBatch(
      {
        timeNs: [1n, 2n],
        source: createSource("source:1"),
        topics: ["/camera"],
      },
      { priority: "idle" },
    );
    const idleWorker = workers[0];
    const range = client.readTimelineRange(createTimelineRequest("source:2"));
    const foregroundWorker = workers[1];

    expect(idleWorker.messages.at(-1)).toEqual({ type: "dispose" });
    expect(idleWorker.terminate).toHaveBeenCalledTimes(1);
    await expect(idle).rejects.toThrow("different source");

    foregroundWorker.respond({
      id: 1,
      ok: true,
      result: createTimelineRange(2n, 3n),
    });
    await expect(range).resolves.toEqual(createTimelineRange(2n, 3n));
  });

  it("rejects failed worker responses", async () => {
    const { client, workers } = createClientHarness();
    const frame = client.readSynchronizedMessages({
      timeNs: 1n,
      source: createSource("source:1"),
      topics: ["/camera"],
    });

    workers[0].respond({ error: "decode failed", id: 1, ok: false });

    await expect(frame).rejects.toThrow("decode failed");
  });

  it("streams decoded-message responses incrementally", async () => {
    const { client, workers } = createClientHarness();
    const stream = client.readDecodedMessages({
      source: createSource("source:1"),
      topics: ["/camera"],
    });
    const first = stream.next();

    expect(workers[0].messages[1]).toMatchObject({
      id: 1,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      type: "readDecodedMessages",
    });

    workers[0].respond({
      done: false,
      id: 1,
      item: createDecodedMessage(1n),
      ok: true,
      stream: true,
    });

    await expect(first).resolves.toEqual({
      done: false,
      value: createDecodedMessage(1n),
    });

    const second = stream.next();
    workers[0].respond({
      done: true,
      id: 1,
      ok: true,
      stream: true,
    });

    await expect(second).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it("resets the worker on source changes and ignores stale responses", async () => {
    const { client, workers } = createClientHarness();
    const first = client.readTimelineRange(createTimelineRequest("source:1"));
    const firstWorker = workers[0];
    const second = client.readTimelineRange(createTimelineRequest("source:2"));
    const secondWorker = workers[1];

    expect(firstWorker.messages.at(-1)).toEqual({ type: "dispose" });
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);
    await expect(first).rejects.toThrow("different source");

    firstWorker.respond({
      id: 1,
      ok: true,
      result: createTimelineRange(1n, 1n),
    });
    secondWorker.respond({
      id: 2,
      ok: true,
      result: createTimelineRange(2n, 2n),
    });

    await expect(second).resolves.toEqual(createTimelineRange(2n, 2n));
  });

  it("does not reuse a worker for delimiter-like source identities", async () => {
    const { client, workers } = createClientHarness();
    const first = client.readTimelineRange({
      source: createSource("source|1", "nested|path"),
    });
    const second = client.readTimelineRange({
      source: createSource("source", "1|nested|path"),
    });

    expect(workers).toHaveLength(2);
    await expect(first).rejects.toThrow("different source");

    workers[1].respond({
      id: 2,
      ok: true,
      result: createTimelineRange(2n, 2n),
    });

    await expect(second).resolves.toEqual(createTimelineRange(2n, 2n));
  });

  it("terminates the worker and rejects pending requests on dispose", async () => {
    const { client, workers } = createClientHarness();
    const range = client.readTimelineRange(createTimelineRequest());
    const worker = workers[0];

    client.dispose();

    expect(worker.messages.at(-1)).toEqual({ type: "dispose" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(range).rejects.toThrow("disposed");
  });

  it("rejects worker startup errors", async () => {
    const client = createWorkerMcapResourceClient({
      workerFactory: () => {
        throw new Error("worker blocked");
      },
    });

    expect(() => client.readTimelineRange(createTimelineRequest())).toThrow(
      "worker blocked",
    );
  });

  it("tears down partial workers when init postMessage throws", async () => {
    const worker = new MockWorker({ throwOnMessageType: "init" });
    const client = createWorkerMcapResourceClient({
      workerFactory: () => worker as unknown as Worker,
    });

    expect(() => client.readTimelineRange(createTimelineRequest())).toThrow(
      "postMessage failed",
    );

    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("marks reset streams terminal after buffered values drain", async () => {
    const { client, workers } = createClientHarness();
    const stream = client.readDecodedMessages({
      source: createSource("source:1"),
      topics: ["/camera"],
    });
    const first = stream.next();
    const worker = workers[0];
    const firstMessage = createDecodedMessage(1n);
    const secondMessage = createDecodedMessage(2n);

    worker.respond({
      done: false,
      id: 1,
      item: firstMessage,
      ok: true,
      stream: true,
    });
    worker.respond({
      done: false,
      id: 1,
      item: secondMessage,
      ok: true,
      stream: true,
    });
    worker.emitError("worker crashed");

    await expect(first).resolves.toEqual({
      done: false,
      value: firstMessage,
    });
    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: secondMessage,
    });
    await expect(stream.next()).rejects.toThrow("worker crashed");
  });
});

function createClientHarness() {
  const workers: MockWorker[] = [];
  const client = createWorkerMcapResourceClient({
    workerFactory: () => {
      const worker = new MockWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });

  return { client, workers };
}

function createTimelineRequest(sourceId = "source:1") {
  return {
    source: createSource(sourceId),
  };
}

function createTimelineRange(startTimeNs: bigint, endTimeNs: bigint) {
  return {
    activeTimeline: "log" as const,
    endTimeNs,
    startTimeNs,
  };
}

function createSynchronizedWindow(timeNs: bigint) {
  return {
    activeTimeline: "log" as const,
    endTimeNs: timeNs,
    messages: [],
    messagesByTopic: {},
    startTimeNs: timeNs,
    streamPolicies: {},
    timeNs,
  };
}

function createSource(
  sourceId: string,
  url = `mcap-source://${encodeURIComponent(sourceId)}`,
) {
  return {
    sizeBytes: "1024",
    sourceId,
    url,
  };
}

function createDecodedMessage(timelineTimeNs: bigint) {
  return {
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
    logTimeNs: timelineTimeNs,
    publishTimeNs: timelineTimeNs,
    sequence: 1,
    timelineTimeNs,
    activeTimeline: "log" as const,
    topic: "/camera",
  };
}

function createTopic(topic: string) {
  return create(StreamInventorySchema, {
    displayName: topic,
    metadata: {
      "mcap.topic": topic,
    },
    payload: {
      encoding: "protobuf",
      schema: "foxglove.CompressedImage",
      schemaEncoding: "protobuf",
    },
    streamId: topic,
  });
}

class MockWorker {
  handlerSnapshots: Array<{
    readonly hasErrorHandler: boolean;
    readonly hasMessageHandler: boolean;
  }> = [];
  messages: McapPlaybackWorkerRequest[] = [];
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage:
    | ((event: MessageEvent<McapPlaybackWorkerResponse>) => void)
    | null = null;
  postMessage = vi.fn((message: McapPlaybackWorkerRequest) => {
    if (message.type === this.throwOnMessageType) {
      throw new Error("postMessage failed");
    }

    this.handlerSnapshots.push({
      hasErrorHandler: Boolean(this.onerror),
      hasMessageHandler: Boolean(this.onmessage),
    });
    this.messages.push(message);
  });
  terminate = vi.fn();

  constructor(
    private readonly options: {
      readonly throwOnMessageType?: McapPlaybackWorkerRequest["type"];
    } = {},
  ) {}

  private get throwOnMessageType() {
    return this.options.throwOnMessageType;
  }

  emitError(message: string) {
    this.onerror?.({ message } as ErrorEvent);
  }

  respond(response: McapPlaybackWorkerResponse) {
    this.onmessage?.({
      data: response,
    } as MessageEvent<McapPlaybackWorkerResponse>);
  }
}
