import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerRequest,
} from "./playback-worker-types";

type WorkerClientMock = {
  readonly dispose: Mock;
  readonly readTopics: Mock;
};

const workerResourceClientMock = vi.hoisted(() => ({
  clients: [] as WorkerClientMock[],
}));

vi.mock("./worker-resource-client", () => ({
  createWorkerResourceClient: vi.fn(() => {
    const client: WorkerClientMock = {
      dispose: vi.fn(),
      readTopics: vi.fn(async () => []),
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
});

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
