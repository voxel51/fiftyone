import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  McapGridPreviewWorkerRequest,
  McapGridPreviewWorkerResponse,
  McapGridPreviewWorkerRpcRequest,
} from "./grid-preview-worker-types";
import {
  getMcapGridPreviewPool,
  resetMcapGridPreviewPoolForTests,
} from "./grid-preview-pool";

vi.mock("@fiftyone/utilities", () => ({
  getFetchParameters: () => ({
    headers: { Authorization: "token" },
    origin: "http://localhost:5151",
    pathPrefix: "/proxy",
  }),
  mergeHeaders: (...headers: readonly Record<string, string>[]) =>
    Object.assign({}, ...headers),
}));

afterEach(() => {
  resetMcapGridPreviewPoolForTests();
});

describe("MCAP grid preview worker pool", () => {
  it("keeps requests for the same source on the same worker", async () => {
    const { pool, workers } = createPoolHarness();
    const source = createSource("source:1");

    const first = pool.request({ source });
    const second = pool.request({ source });

    expect(workers).toHaveLength(1);
    expect(workers[0].messages[0]).toEqual({
      payload: {
        headers: { Authorization: "token" },
        origin: "http://localhost:5151",
        pathPrefix: "/proxy",
      },
      type: "init",
    });
    expect(rpcMessages(workers[0])).toHaveLength(2);

    respondToAll(workers);

    await expect(first).resolves.toEqual(createResult());
    await expect(second).resolves.toEqual(createResult());
  });

  it("does not create more workers than the configured pool size", async () => {
    const { pool, workers } = createPoolHarness({ poolSize: 2 });
    const requests = Array.from({ length: 8 }, (_, index) =>
      pool.request({ source: createSource(`source:${index}`) })
    );

    expect(workers.length).toBeLessThanOrEqual(2);

    respondToAll(workers);
    await Promise.all(requests);
  });

  it("allows a single-worker pool on low-resource configurations", async () => {
    const { pool, workers } = createPoolHarness({ poolSize: 1 });
    const requests = Array.from({ length: 4 }, (_, index) =>
      pool.request({ source: createSource(`source:${index}`) })
    );

    expect(workers).toHaveLength(1);

    respondToAll(workers);
    await Promise.all(requests);
  });

  it("terminates workers only after all grid users release the pool", async () => {
    const { pool, workers } = createPoolHarness();
    pool.acquire();
    pool.acquire();

    const request = pool.request({ source: createSource("source:1") });
    respondToAll(workers);
    await request;

    pool.release();
    expect(workers[0].terminate).not.toHaveBeenCalled();

    pool.release();
    expect(workers[0].messages.at(-1)).toEqual({ type: "dispose" });
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("rejects pending work and respawns a slot after worker errors", async () => {
    const { pool, workers } = createPoolHarness();
    const first = pool.request({ source: createSource("source:1") });
    const firstWorker = workers[0];

    firstWorker.emitError("grid worker crashed");

    await expect(first).rejects.toThrow("grid worker crashed");
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);

    const second = pool.request({ source: createSource("source:1") });
    expect(workers[1]).not.toBe(firstWorker);
    respondToAll([workers[1]]);

    await expect(second).resolves.toEqual(createResult());
  });

  it("forwards abort cancellation to the selected worker", async () => {
    const { pool, workers } = createPoolHarness();
    const controller = new AbortController();
    const request = pool.request(
      { source: createSource("source:1") },
      { signal: controller.signal }
    );

    controller.abort();

    expect(workers[0].messages.at(-1)).toEqual({ id: 1, type: "cancel" });
    await expect(request).rejects.toThrow("cancelled");
  });
});

function createPoolHarness(options: { readonly poolSize?: number } = {}) {
  const workers: MockGridPreviewWorker[] = [];
  resetMcapGridPreviewPoolForTests({
    poolSize: options.poolSize ?? 2,
    workerFactory: () => {
      const worker = new MockGridPreviewWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });

  return {
    pool: getMcapGridPreviewPool(),
    workers,
  };
}

function createSource(sourceId: string) {
  return {
    sourceId,
    url: `mcap-source://${encodeURIComponent(sourceId)}`,
  };
}

function createResult() {
  return {
    state: {
      error: null,
      frame: null,
      hasImageTopics: false,
      imageTopic: null,
      imageTopics: [],
      status: "empty" as const,
    },
  };
}

function rpcMessages(
  worker: MockGridPreviewWorker
): McapGridPreviewWorkerRpcRequest[] {
  return worker.messages.filter(
    (message): message is McapGridPreviewWorkerRpcRequest =>
      message.type === "decodeGridPreview"
  );
}

function respondToAll(workers: readonly MockGridPreviewWorker[]) {
  for (const worker of workers) {
    for (const message of rpcMessages(worker)) {
      worker.respond({
        id: message.id,
        ok: true,
        result: createResult(),
      });
    }
  }
}

class MockGridPreviewWorker {
  messages: McapGridPreviewWorkerRequest[] = [];
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage:
    | ((event: MessageEvent<McapGridPreviewWorkerResponse>) => void)
    | null = null;
  postMessage = vi.fn((message: McapGridPreviewWorkerRequest) => {
    this.messages.push(message);
  });
  terminate = vi.fn();

  emitError(message: string) {
    this.onerror?.({ message } as ErrorEvent);
  }

  respond(response: McapGridPreviewWorkerResponse) {
    this.onmessage?.({
      data: response,
    } as MessageEvent<McapGridPreviewWorkerResponse>);
  }
}
