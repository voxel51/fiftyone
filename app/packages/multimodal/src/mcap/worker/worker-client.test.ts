import { create } from "@bufbuild/protobuf";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StreamInventorySchema } from "../../schemas/v1";
import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerRequest,
  type McapPlaybackWorkerResponse,
} from "./playback-worker-types";
import { createWorkerMcapResourceClient } from "./worker-client";

const resourcesHarness = vi.hoisted(() => {
  const inlineClient = {
    dispose: vi.fn(),
    readDecodedMessages: vi.fn(async function* () {
      for (const item of [] as never[]) {
        yield item;
      }
      return;
    }),
    readSynchronizedMessageBatch: vi.fn(async () => []),
    readSynchronizedMessages: vi.fn(),
    readTopics: vi.fn(async () => []),
    readTimelineRange: vi.fn(async () => createTimelineRange(1n, 42n)),
  };

  return {
    createMcapResourceClient: vi.fn(() => inlineClient),
    inlineClient,
  };
});

vi.mock("@fiftyone/utilities", () => ({
  getFetchParameters: () => ({
    headers: { Authorization: "token" },
    origin: "http://localhost:5151",
    pathPrefix: "/proxy",
  }),
  mergeHeaders: (...headers: readonly Record<string, string>[]) =>
    Object.assign({}, ...headers),
}));

vi.mock("../resources", () => ({
  createMcapResourceClient: resourcesHarness.createMcapResourceClient,
}));

describe("worker-backed MCAP resource client", () => {
  beforeEach(() => {
    resourcesHarness.createMcapResourceClient.mockClear();
    resourcesHarness.inlineClient.dispose.mockClear();
    resourcesHarness.inlineClient.readDecodedMessages.mockClear();
    resourcesHarness.inlineClient.readSynchronizedMessageBatch.mockClear();
    resourcesHarness.inlineClient.readSynchronizedMessages.mockClear();
    resourcesHarness.inlineClient.readTopics.mockClear();
    resourcesHarness.inlineClient.readTimelineRange.mockClear();
  });

  it("initializes the worker and maps resource calls to RPC messages", async () => {
    const { client, workers } = createClientHarness();
    const request = createTimelineRequest();

    const range = client.readTimelineRange(request);
    const worker = workers[0];

    expect(worker.messages[0]).toEqual({
      payload: {
        headers: { Authorization: "token" },
        origin: "http://localhost:5151",
        pathPrefix: "/proxy",
      },
      type: "init",
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

  it("falls back to the inline client when worker creation fails", async () => {
    const client = createWorkerMcapResourceClient({
      fallback: "inline",
      workerFactory: () => {
        throw new Error("worker blocked");
      },
    });
    const request = createTimelineRequest();

    await expect(client.readTimelineRange(request)).resolves.toEqual(
      createTimelineRange(1n, 42n)
    );

    expect(resourcesHarness.createMcapResourceClient).toHaveBeenCalledTimes(1);
    expect(
      resourcesHarness.inlineClient.readTimelineRange
    ).toHaveBeenCalledWith(request);
  });

  it("falls back to inline topic reads when worker creation fails", async () => {
    const client = createWorkerMcapResourceClient({
      fallback: "inline",
      workerFactory: () => {
        throw new Error("worker blocked");
      },
    });
    const request = {
      source: createSource("source:topics"),
    };

    await expect(client.readTopics(request)).resolves.toEqual([]);

    expect(resourcesHarness.createMcapResourceClient).toHaveBeenCalledTimes(1);
    expect(resourcesHarness.inlineClient.readTopics).toHaveBeenCalledWith(
      request
    );
  });

  it("rejects worker startup errors when inline fallback is disabled", async () => {
    const client = createWorkerMcapResourceClient({
      fallback: "error",
      workerFactory: () => {
        throw new Error("worker blocked");
      },
    });

    expect(() => client.readTimelineRange(createTimelineRequest())).toThrow(
      "worker blocked"
    );
  });

  it("tears down partial workers when init postMessage throws", async () => {
    const worker = new MockWorker({ throwOnMessageType: "init" });
    const client = createWorkerMcapResourceClient({
      fallback: "error",
      workerFactory: () => worker as unknown as Worker,
    });

    expect(() => client.readTimelineRange(createTimelineRequest())).toThrow(
      "postMessage failed"
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
    fallback: "error",
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

function createSource(
  sourceId: string,
  url = `mcap-source://${encodeURIComponent(sourceId)}`
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
  messages: McapPlaybackWorkerRequest[] = [];
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage:
    | ((event: MessageEvent<McapPlaybackWorkerResponse>) => void)
    | null = null;
  postMessage = vi.fn((message: McapPlaybackWorkerRequest) => {
    if (message.type === this.throwOnMessageType) {
      throw new Error("postMessage failed");
    }

    this.messages.push(message);
  });
  terminate = vi.fn();

  constructor(
    private readonly options: {
      readonly throwOnMessageType?: McapPlaybackWorkerRequest["type"];
    } = {}
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
