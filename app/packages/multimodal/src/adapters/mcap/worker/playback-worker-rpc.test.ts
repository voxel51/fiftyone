import { describe, expect, it, vi } from "vitest";
import type { McapResourceClient } from "../contracts";
import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerRpcRequest,
} from "./playback-worker-types";
import {
  mcapPlaybackWorkerOperation,
  runMcapPlaybackWorkerStreamRequest,
  runMcapPlaybackWorkerUnaryRequest,
} from "./playback-worker-rpc";
import type { McapPlaybackWorkerResourceClient } from "./worker-resource-client";

const source = { sourceId: "fixture", url: "memory://fixture" };

describe("exact-message playback worker RPC", () => {
  it("preserves an undefined synchronized stream rejection", async () => {
    const client = {
      readSynchronizedMessages: vi.fn(() => Promise.reject(undefined)),
    } as unknown as McapPlaybackWorkerResourceClient;
    const request: McapPlaybackWorkerRpcRequest<"readSynchronizedMessages"> = {
      id: 1,
      payload: { source, timeNs: 1n, topics: ["/camera"] },
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      sourceKey: "source-key",
      type: "readSynchronizedMessages",
    };
    let rejected = false;

    try {
      await runMcapPlaybackWorkerStreamRequest(client, request).next();
    } catch (error) {
      rejected = true;
      expect(error).toBeUndefined();
    }
    expect(rejected).toBe(true);
  });

  it("dispatches index and exact-record reads on the interactive lane", async () => {
    const indexResult = {
      entries: [{ cursor: "cursor-2", logTimeNs: 2n }],
      hasNext: false,
      hasPrevious: false,
      selectedCursor: "cursor-2",
    };
    const exactResult = {
      cursor: "cursor-2",
      logTimeNs: 2n,
      messageEncoding: "json",
      schemaName: null,
      status: "ok" as const,
      topic: "/camera",
      validFromNs: 2n,
      validUntilNs: 3n,
    };
    const readMessageIndexWindow = vi.fn(async () => indexResult);
    const readRawMessageAtCursor = vi.fn(async () => exactResult);
    const client = {
      readMessageIndexWindow,
      readRawMessageAtCursor,
    } as unknown as McapPlaybackWorkerResourceClient;
    const indexRequest: McapPlaybackWorkerRpcRequest<"readMessageIndexWindow"> =
      {
        id: 1,
        payload: {
          after: 5,
          anchorCursor: "cursor-2",
          before: 5,
          source,
          topic: "/camera",
        },
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
        sourceKey: "source-key",
        type: "readMessageIndexWindow",
      };
    const exactRequest: McapPlaybackWorkerRpcRequest<"readRawMessageAtCursor"> =
      {
        id: 2,
        payload: { cursor: "cursor-2", source, topic: "/camera" },
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
        sourceKey: "source-key",
        type: "readRawMessageAtCursor",
      };

    await expect(
      runMcapPlaybackWorkerUnaryRequest(client, indexRequest),
    ).resolves.toEqual(indexResult);
    await expect(
      runMcapPlaybackWorkerUnaryRequest(client, exactRequest),
    ).resolves.toEqual(exactResult);
    expect(readMessageIndexWindow).toHaveBeenCalledWith(indexRequest.payload);
    expect(readRawMessageAtCursor).toHaveBeenCalledWith(exactRequest.payload);
    expect(mcapPlaybackWorkerOperation(indexRequest.type).priority).toBe(
      MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
    );
    expect(mcapPlaybackWorkerOperation(exactRequest.type).priority).toBe(
      MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
    );
  });

  it("rejects exact operations when the worker client lacks the capability", async () => {
    const client = {} as McapResourceClient as McapPlaybackWorkerResourceClient;
    const request: McapPlaybackWorkerRpcRequest<"readRawMessageAtCursor"> = {
      id: 1,
      payload: { cursor: "cursor-2", source, topic: "/camera" },
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      sourceKey: "source-key",
      type: "readRawMessageAtCursor",
    };

    await expect(
      runMcapPlaybackWorkerUnaryRequest(client, request),
    ).rejects.toThrow("Exact MCAP message reads are unavailable");

    const indexRequest: McapPlaybackWorkerRpcRequest<"readMessageIndexWindow"> =
      {
        id: 2,
        payload: {
          after: 5,
          anchorTimeNs: 1n,
          before: 5,
          source,
          topic: "/camera",
        },
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
        sourceKey: "source-key",
        type: "readMessageIndexWindow",
      };
    await expect(
      runMcapPlaybackWorkerUnaryRequest(client, indexRequest),
    ).rejects.toThrow("Exact MCAP message indexes are unavailable");
  });
});
