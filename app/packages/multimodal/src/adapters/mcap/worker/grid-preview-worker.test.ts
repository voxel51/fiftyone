import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { MCAP_PLAYBACK_WORKER_PRIORITY } from "./playback-worker-types";
import type { McapGridPreviewResult } from "../resource-client/grid-preview";
import type { McapGridPreviewWorkerRequest } from "./grid-preview-worker-types";

type WorkerClientMock = {
  readonly dispose: Mock;
};

const gridPreviewHarness = vi.hoisted(() => ({
  clients: [] as WorkerClientMock[],
  decodeGridPreview: vi.fn(),
  readSignals: [] as Array<{ current: AbortSignal | null }>,
}));

vi.mock("@fiftyone/utilities", () => ({
  setFetchFunction: vi.fn(),
}));

vi.mock("../resource-client/grid-preview", () => ({
  decodeGridPreview: gridPreviewHarness.decodeGridPreview,
}));

vi.mock("./worker-resource-client", () => ({
  createWorkerResourceClient: vi.fn(
    (options: { readonly readSignal: { current: AbortSignal | null } }) => {
      const client: WorkerClientMock = { dispose: vi.fn() };
      gridPreviewHarness.clients.push(client);
      gridPreviewHarness.readSignals.push(options.readSignal);
      return client;
    },
  ),
}));

type WorkerScopeMock = {
  close: Mock;
  onmessage:
    | ((event: MessageEvent<McapGridPreviewWorkerRequest>) => void)
    | null;
  postMessage: Mock;
};

describe("MCAP grid preview worker cancellation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    gridPreviewHarness.clients.length = 0;
    gridPreviewHarness.decodeGridPreview.mockReset();
    gridPreviewHarness.readSignals.length = 0;
  });

  it("removes cancelled queued demand before it starts", async () => {
    const first = deferred<McapGridPreviewResult>();
    gridPreviewHarness.decodeGridPreview.mockReturnValueOnce(first.promise);
    const workerScope = await startWorker();

    dispatchDecode(workerScope, 1, "source:1");
    await vi.waitFor(() =>
      expect(gridPreviewHarness.decodeGridPreview).toHaveBeenCalledOnce(),
    );
    dispatchDecode(workerScope, 2, "source:2");
    dispatch(workerScope, { id: 2, type: "cancel" });

    first.resolve(createResult());
    await vi.waitFor(() =>
      expect(workerScope.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, ok: true }),
        [],
      ),
    );

    expect(gridPreviewHarness.decodeGridPreview).toHaveBeenCalledTimes(1);
    expect(responseFor(workerScope, 2)).toBeUndefined();
  });

  it("aborts running demand and immediately drains the next request", async () => {
    const runningSignals: AbortSignal[] = [];
    gridPreviewHarness.decodeGridPreview
      .mockImplementationOnce(
        () =>
          new Promise<McapGridPreviewResult>((_resolve, reject) => {
            const runningSignal =
              gridPreviewHarness.readSignals[0]?.current ?? null;
            if (!runningSignal) {
              reject(new Error("Expected an active grid demand signal"));
              return;
            }
            runningSignals.push(runningSignal);
            runningSignal.addEventListener(
              "abort",
              () => reject(new Error("grid demand aborted")),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce(createResult());
    const workerScope = await startWorker();

    dispatchDecode(workerScope, 1, "source:1");
    dispatchDecode(workerScope, 2, "source:2");
    await vi.waitFor(() => expect(runningSignals).toHaveLength(1));
    expect(runningSignals[0]?.aborted).toBe(false);

    dispatch(workerScope, { id: 1, type: "cancel" });

    expect(runningSignals[0]?.aborted).toBe(true);
    await vi.waitFor(() =>
      expect(gridPreviewHarness.decodeGridPreview).toHaveBeenCalledTimes(2),
    );
    await vi.waitFor(() =>
      expect(responseFor(workerScope, 2)).toMatchObject({ id: 2, ok: true }),
    );
    expect(responseFor(workerScope, 1)).toMatchObject({
      error: "grid demand aborted",
      id: 1,
      ok: false,
    });
    expect(gridPreviewHarness.readSignals[0]?.current).toBeNull();
  });
});

async function startWorker(): Promise<WorkerScopeMock> {
  const workerScope: WorkerScopeMock = {
    close: vi.fn(),
    onmessage: null,
    postMessage: vi.fn(),
  };
  vi.stubGlobal("self", workerScope);
  await import("./grid-preview-worker");
  return workerScope;
}

function dispatchDecode(
  workerScope: WorkerScopeMock,
  id: number,
  sourceKey: string,
) {
  dispatch(workerScope, {
    id,
    payload: {
      source: {
        sourceId: sourceKey,
        url: `mcap://${encodeURIComponent(sourceKey)}`,
      },
    },
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
    sourceKey,
    type: "decodeGridPreview",
  });
}

function dispatch(
  workerScope: WorkerScopeMock,
  request: McapGridPreviewWorkerRequest,
) {
  workerScope.onmessage?.({
    data: request,
  } as MessageEvent<McapGridPreviewWorkerRequest>);
}

function responseFor(workerScope: WorkerScopeMock, id: number) {
  return workerScope.postMessage.mock.calls.find(
    ([response]) => response.id === id,
  )?.[0];
}

function createResult(): McapGridPreviewResult {
  return {
    state: {
      error: null,
      frame: null,
      hasPreviewTopics: false,
      streamTopic: null,
      streamTopics: [],
      status: "empty",
    },
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
