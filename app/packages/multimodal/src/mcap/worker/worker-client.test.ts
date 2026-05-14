import { describe, expect, it, vi } from "vitest";
import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerRequest,
  type McapPlaybackWorkerResponse,
} from "./playback-worker-types";
import { createWorkerMcapResourceClient } from "./worker-client";

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

    const anchors = client.readTimelineAnchors(request);
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
      type: "readTimelineAnchors",
    });

    worker.respond({ id: 1, ok: true, result: [1n, 2n] });

    await expect(anchors).resolves.toEqual([1n, 2n]);
  });

  it("sends playback batches at playback priority", async () => {
    const { client, workers } = createClientHarness();
    const request = {
      anchorTimeNs: [1n, 2n],
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
      anchorTimeNs: 1n,
      source: createSource("source:1"),
      topics: ["/camera"],
    });

    workers[0].respond({ error: "decode failed", id: 1, ok: false });

    await expect(frame).rejects.toThrow("decode failed");
  });

  it("streams message-time responses incrementally", async () => {
    const { client, workers } = createClientHarness();
    const stream = client.readMessageTimes({
      source: createSource("source:1"),
      topics: ["/camera"],
    });
    const first = stream.next();

    expect(workers[0].messages[1]).toMatchObject({
      id: 1,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      type: "readMessageTimes",
    });

    workers[0].respond({
      done: false,
      id: 1,
      item: createMessageTime(1n),
      ok: true,
      stream: true,
    });

    await expect(first).resolves.toEqual({
      done: false,
      value: createMessageTime(1n),
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
    const first = client.readTimelineAnchors(createTimelineRequest("source:1"));
    const firstWorker = workers[0];
    const second = client.readTimelineAnchors(
      createTimelineRequest("source:2")
    );
    const secondWorker = workers[1];

    expect(firstWorker.messages.at(-1)).toEqual({ type: "dispose" });
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);
    await expect(first).rejects.toThrow("different source");

    firstWorker.respond({ id: 1, ok: true, result: [1n] });
    secondWorker.respond({ id: 2, ok: true, result: [2n] });

    await expect(second).resolves.toEqual([2n]);
  });

  it("terminates the worker and rejects pending requests on dispose", async () => {
    const { client, workers } = createClientHarness();
    const anchors = client.readTimelineAnchors(createTimelineRequest());
    const worker = workers[0];

    client.dispose();

    expect(worker.messages.at(-1)).toEqual({ type: "dispose" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(anchors).rejects.toThrow("disposed");
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
    limit: 10,
    source: createSource(sourceId),
    topic: "/camera",
  };
}

function createSource(sourceId: string) {
  return {
    sizeBytes: "1024",
    sourceId,
    url: `/media?filepath=${encodeURIComponent(sourceId)}`,
  };
}

function createMessageTime(syncTimeNs: bigint) {
  return {
    channelId: 1,
    logTimeNs: syncTimeNs,
    publishTimeNs: syncTimeNs,
    sequence: 1,
    syncTimeNs,
    timestampSource: "log" as const,
    topic: "/camera",
  };
}

class MockWorker {
  messages: McapPlaybackWorkerRequest[] = [];
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage:
    | ((event: MessageEvent<McapPlaybackWorkerResponse>) => void)
    | null = null;
  postMessage = vi.fn((message: McapPlaybackWorkerRequest) => {
    this.messages.push(message);
  });
  terminate = vi.fn();

  respond(response: McapPlaybackWorkerResponse) {
    this.onmessage?.({
      data: response,
    } as MessageEvent<McapPlaybackWorkerResponse>);
  }
}
