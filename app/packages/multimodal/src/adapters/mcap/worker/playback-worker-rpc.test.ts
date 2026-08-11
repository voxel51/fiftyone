import { describe, expect, it, vi } from "vitest";
import type { ReadContinuation } from "../../../ports";
import type { McapResourceClient } from "../contracts";
import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerRpcRequest,
} from "./playback-worker-types";
import {
  mcapPlaybackWorkerOperation,
  runMcapPlaybackWorkerUnaryRequest,
} from "./playback-worker-rpc";
import { summarizeMcapWorkerRequest } from "./playback-worker-request-attribution";
import type { McapPlaybackWorkerResourceClient } from "./worker-resource-client";

const source = { sourceId: "fixture", url: "memory://fixture" };

describe("exact-message playback worker RPC", () => {
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

  it("attributes bounds and topic without logging opaque cursors", () => {
    const indexSummary = summarizeMcapWorkerRequest({
      id: 1,
      payload: {
        after: 5,
        anchorCursor: "secret-opaque-cursor",
        before: 7,
        source,
        topic: "/camera",
      },
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      sourceKey: "source-key",
      type: "readMessageIndexWindow",
    });
    const exactSummary = summarizeMcapWorkerRequest({
      id: 2,
      payload: {
        cursor: "secret-opaque-cursor",
        source,
        topic: "/camera",
      },
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      sourceKey: "source-key",
      type: "readRawMessageAtCursor",
    });
    const topologySummary = summarizeMcapWorkerRequest({
      id: 3,
      payload: {
        absoluteBudget: {
          maxMessages: 10,
          maxSourceBytes: 1_000,
          maxUncompressedBytes: 2_000,
          maxWallTimeMs: 100,
        },
        absoluteMaxChunks: 4,
        activeTimeline: "log",
        budget: {
          maxMessages: 5,
          maxSourceBytes: 500,
          maxUncompressedBytes: 1_000,
          maxWallTimeMs: 50,
        },
        continuation: {
          secret: "secret-topology-continuation",
        } as ReadContinuation,
        endTimeNs: 20n,
        frameUseTopics: ["/points", "/camera"],
        maxChunks: 2,
        source,
        startTimeNs: 10n,
      },
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.BULK_HISTORY,
      sourceKey: "source-key",
      type: "readTransformTopology",
    });

    expect(indexSummary).toEqual({ limit: 13, topics: ["/camera"] });
    expect(exactSummary).toEqual({ topics: ["/camera"] });
    expect(topologySummary).toEqual({
      activeTimeline: "log",
      endTimeNs: "20",
      requestedTopics: 2,
      startTimeNs: "10",
    });
    expect(JSON.stringify([indexSummary, exactSummary])).not.toContain(
      "secret-opaque-cursor",
    );
    expect(JSON.stringify(topologySummary)).not.toContain(
      "secret-topology-continuation",
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
