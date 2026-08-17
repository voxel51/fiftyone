import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerRequest,
} from "./playback-worker-types";

type WorkerClientMock = {
  readonly dispose: Mock;
  readonly readSynchronizedMessages: Mock;
  readonly readTopics: Mock;
};

const workerResourceClientMock = vi.hoisted(() => ({
  afterTopicSettlement: undefined as ((topic: string) => void) | undefined,
  clients: [] as WorkerClientMock[],
  synchronizedSettlements: [] as Array<{
    readonly topic: string;
    readonly window: unknown;
  }>,
  synchronizedResult: null as unknown,
}));

vi.mock("./worker-resource-client", () => ({
  createWorkerResourceClient: vi.fn(() => {
    const client: WorkerClientMock = {
      dispose: vi.fn(),
      readSynchronizedMessages: vi.fn(async (_request, options) => {
        const settlements = workerResourceClientMock.synchronizedSettlements
          .length
          ? workerResourceClientMock.synchronizedSettlements
          : [
              {
                topic: "/camera",
                window: workerResourceClientMock.synchronizedResult,
              },
            ];
        for (const settlement of settlements) {
          options?.onTopicSettlement?.(settlement);
          workerResourceClientMock.afterTopicSettlement?.(settlement.topic);
        }
        return workerResourceClientMock.synchronizedResult;
      }),
      readTopics: vi.fn(async () => ({
        recordingFacts: { format: "mcap" },
        streams: [],
      })),
    };
    workerResourceClientMock.clients.push(client);
    return client;
  }),
}));

type WorkerScopeMock = {
  close: Mock;
  onmessage: ((event: MessageEvent<McapPlaybackWorkerRequest>) => void) | null;
  postMessage: Mock;
};

describe("MCAP playback worker lifecycle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    workerResourceClientMock.clients.length = 0;
    workerResourceClientMock.afterTopicSettlement = undefined;
    workerResourceClientMock.synchronizedSettlements.length = 0;
    workerResourceClientMock.synchronizedResult = null;
  });

  it("releases active and parked source clients while keeping the worker alive", async () => {
    const workerScope: WorkerScopeMock = {
      close: vi.fn(),
      onmessage: null,
      postMessage: vi.fn(),
    };
    vi.stubGlobal("self", workerScope);
    await import("./playback-worker");

    await readTopics(workerScope, 1, "source:1");
    await readTopics(workerScope, 2, "source:2");

    const [bootstrap, parked, active] = workerResourceClientMock.clients;
    expect(bootstrap.dispose).toHaveBeenCalledOnce();
    expect(parked.dispose).not.toHaveBeenCalled();
    expect(active.dispose).not.toHaveBeenCalled();

    dispatch(workerScope, { type: "releaseRetainedResources" });

    expect(parked.dispose).toHaveBeenCalledOnce();
    expect(active.dispose).toHaveBeenCalledOnce();
    expect(workerScope.close).not.toHaveBeenCalled();

    const releasedBootstrap = workerResourceClientMock.clients[3];
    await readTopics(workerScope, 3, "source:1");
    expect(releasedBootstrap.dispose).toHaveBeenCalledOnce();
    expect(workerResourceClientMock.clients).toHaveLength(5);
    expect(workerResourceClientMock.clients[4]).not.toBe(parked);
  });

  it("transfers settled payloads once and omits them from the terminal item", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    workerResourceClientMock.synchronizedResult = synchronizedWindow(bytes);
    const workerScope: WorkerScopeMock = {
      close: vi.fn(),
      onmessage: null,
      postMessage: vi.fn((response, transferables?: Transferable[]) => {
        structuredClone(response, { transfer: transferables ?? [] });
      }),
    };
    vi.stubGlobal("self", workerScope);
    await import("./playback-worker");

    dispatch(workerScope, {
      id: 1,
      payload: {
        settlementPriorityTopics: ["/camera"],
        source: { sizeBytes: "1024", sourceId: "source:1", url: "mcap://1" },
        timeNs: 1n,
        topics: ["/camera", "/lidar"],
      },
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      sourceKey: "source:1",
      type: "readSynchronizedMessages",
    } as McapPlaybackWorkerRequest);

    await vi.waitFor(() => {
      expect(workerScope.postMessage).toHaveBeenCalledTimes(3);
    });
    expect(workerScope.postMessage.mock.calls[0]).toEqual([
      expect.objectContaining({
        items: [expect.objectContaining({ kind: "topic-settlement" })],
        ok: true,
        stream: true,
      }),
      expect.any(Array),
    ]);
    expect(workerScope.postMessage.mock.calls[0]?.[1]).toHaveLength(1);
    expect(workerScope.postMessage.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        items: [expect.objectContaining({ kind: "terminal" })],
        ok: true,
        stream: true,
      }),
    );
    expect(workerScope.postMessage.mock.calls[1]?.[1]).toEqual([]);
    expect(workerScope.postMessage.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({ done: true, ok: true, stream: true }),
    );
    expect(
      workerScope.postMessage.mock.calls.some(
        ([response]) => response.ok === false,
      ),
    ).toBe(false);
  });

  it("delivers the first useful settlement before the remaining blocking group", async () => {
    const cameraBytes = new Uint8Array([1, 2, 3]);
    const lidarBytes = new Uint8Array([4, 5, 6]);
    const diagnosticBytes = new Uint8Array([7, 8, 9]);
    const camera = synchronizedWindow(cameraBytes, "/camera");
    const lidar = synchronizedWindow(lidarBytes, "/lidar");
    const diagnostics = synchronizedWindow(diagnosticBytes, "/diagnostics");
    workerResourceClientMock.synchronizedSettlements.push(
      { topic: "/camera", window: camera },
      { topic: "/lidar", window: lidar },
      { topic: "/diagnostics", window: diagnostics },
    );
    workerResourceClientMock.synchronizedResult = synchronizedWindow(
      new Uint8Array([]),
      "/terminal",
    );
    const workerScope: WorkerScopeMock = {
      close: vi.fn(),
      onmessage: null,
      postMessage: vi.fn(),
    };
    vi.stubGlobal("self", workerScope);
    await import("./playback-worker");
    const postCountsAfterSettlement: number[] = [];
    workerResourceClientMock.afterTopicSettlement = () => {
      postCountsAfterSettlement.push(workerScope.postMessage.mock.calls.length);
    };

    dispatch(workerScope, {
      id: 1,
      payload: {
        settlementPriorityTopics: ["/camera", "/lidar"],
        source: { sizeBytes: "1024", sourceId: "source:1", url: "mcap://1" },
        timeNs: 1n,
        topics: ["/camera", "/lidar", "/terminal"],
      },
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      sourceKey: "source:1",
      type: "readSynchronizedMessages",
    } as McapPlaybackWorkerRequest);

    await vi.waitFor(() => {
      expect(workerScope.postMessage).toHaveBeenCalledTimes(4);
    });
    expect(workerScope.postMessage.mock.calls[0]).toEqual([
      expect.objectContaining({
        items: [
          expect.objectContaining({
            kind: "topic-settlement",
            topic: "/camera",
          }),
        ],
      }),
      expect.arrayContaining([cameraBytes.buffer]),
    ]);
    expect(workerScope.postMessage.mock.calls[1]).toEqual([
      expect.objectContaining({
        items: [
          expect.objectContaining({
            kind: "topic-settlement",
            topic: "/lidar",
          }),
        ],
      }),
      expect.arrayContaining([lidarBytes.buffer]),
    ]);
    expect(workerScope.postMessage.mock.calls[2]).toEqual([
      expect.objectContaining({
        items: [
          expect.objectContaining({
            kind: "topic-settlement",
            topic: "/diagnostics",
          }),
          expect.objectContaining({ kind: "terminal" }),
        ],
      }),
      expect.arrayContaining([diagnosticBytes.buffer]),
    ]);
    expect(postCountsAfterSettlement).toEqual([1, 2, 2]);
  });

  it("keeps the terminal event payload-free after topic settlement", async () => {
    workerResourceClientMock.synchronizedResult = synchronizedWindow(
      new Uint8Array([1, 2, 3]),
    );
    const workerScope: WorkerScopeMock = {
      close: vi.fn(),
      onmessage: null,
      postMessage: vi.fn(),
    };
    vi.stubGlobal("self", workerScope);
    await import("./playback-worker");

    dispatch(workerScope, {
      id: 1,
      payload: {
        settlementPriorityTopics: ["/camera"],
        source: { sizeBytes: "1024", sourceId: "source:1", url: "mcap://1" },
        timeNs: 1n,
        topics: ["/camera", "/lidar"],
      },
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      sourceKey: "source:1",
      type: "readSynchronizedMessages",
    } as McapPlaybackWorkerRequest);

    await vi.waitFor(() => {
      expect(workerScope.postMessage).toHaveBeenCalledTimes(3);
    });
    const terminalItems = workerScope.postMessage.mock.calls[1]?.[0].items;
    expect(terminalItems).toEqual([
      expect.objectContaining({
        kind: "terminal",
        window: expect.objectContaining({ messages: [], messagesByTopic: {} }),
      }),
    ]);
    expect(
      workerScope.postMessage.mock.calls.some(
        ([response]) => response.ok === false,
      ),
    ).toBe(false);
  });
});

function synchronizedWindow(bytes: Uint8Array, topic = "/camera") {
  const message = {
    activeTimeline: "log" as const,
    channelId: 1,
    decoded: {
      decoderId: "decoder",
      decoderVersion: "1",
      output: {
        attributes: {},
        resourceHints: { transferables: [bytes.buffer] },
      },
      payload: { encoding: "protobuf" },
    },
    logTimeNs: 1n,
    publishTimeNs: 1n,
    sequence: 1,
    timelineTimeNs: 1n,
    topic,
  };
  return {
    activeTimeline: "log" as const,
    endTimeNs: 1n,
    messages: [message],
    messagesByTopic: { [topic]: [message] },
    startTimeNs: 1n,
    streamPolicies: {},
    timeNs: 1n,
  };
}

async function readTopics(
  workerScope: WorkerScopeMock,
  id: number,
  sourceKey: string,
) {
  dispatch(workerScope, {
    id,
    payload: {},
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
    sourceKey,
    type: "readTopics",
  } as McapPlaybackWorkerRequest);
  await vi.waitFor(() => {
    expect(workerScope.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id, ok: true }),
      expect.any(Array),
    );
  });
}

function dispatch(
  workerScope: WorkerScopeMock,
  request: McapPlaybackWorkerRequest,
) {
  workerScope.onmessage?.({
    data: request,
  } as MessageEvent<McapPlaybackWorkerRequest>);
}
