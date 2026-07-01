import { describe, expect, it } from "vitest";
import { createMcapPlaybackWorkerAttributionCollector } from "./playback-worker-attribution";
import { MCAP_PLAYBACK_WORKER_PRIORITY } from "./playback-worker-types";
import type { McapSynchronizedMessageWindow } from "../types";

describe("MCAP playback worker attribution", () => {
  it("aggregates queue, chunk, request, and result details for one worker request", () => {
    const collector = createMcapPlaybackWorkerAttributionCollector(
      {
        id: 7,
        payload: {
          activeTimeline: "log",
          mcapDataRequestId: "batch:1",
          source: {
            sourceId: "source:1",
            url: "mcap-source://source",
          },
          timeNs: [100n, 200n],
          topics: ["/LIDAR_TOP", "/CAM_FRONT"],
        },
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH,
        sourceKey: "source:1",
        type: "readSynchronizedMessageBatch",
      },
      {
        lane: "foreground",
        queueDepthAtStart: 2,
        queueWaitMs: 12.3,
        sourceKey: "source:1",
        startedAtMs: 100,
      },
    );

    collector.recordChunkRead({
      cacheResult: "fetched",
      chunkId: "1000",
      chunkLengthBytes: "100",
      chunkStartOffset: "1000",
      compression: "zstd",
      fetchedBytes: 120,
      kind: "chunk",
      overlapBytes: "80",
      readOffset: "1000",
      requestedBytes: "120",
    });
    collector.recordChunkRead({
      cacheResult: "fetched",
      chunkId: "2000",
      chunkLengthBytes: "200",
      chunkStartOffset: "2000",
      compression: "zstd",
      fetchedBytes: 120,
      kind: "chunk",
      overlapBytes: "40",
      readOffset: "1000",
      requestedBytes: "120",
    });
    collector.recordChunkRead({
      cacheResult: "coalesced",
      chunkId: "1000",
      chunkLengthBytes: "100",
      chunkStartOffset: "1000",
      compression: "zstd",
      fetchedBytes: 0,
      kind: "chunk",
      overlapBytes: "80",
      readOffset: "1000",
      requestedBytes: "120",
    });
    collector.recordResult([createWindow()], 1);

    expect(
      collector.finish({
        nowMs: 145.6,
        ok: true,
      }),
    ).toMatchObject({
      chunkBytes: 300,
      chunkOverlapBytes: 200,
      chunksTouched: 2,
      coalescedReadRequests: 1,
      coalescedRequestedBytes: 120,
      decodedPayloadBytes: 456,
      fetchedBytes: 120,
      lane: "foreground",
      mcapDataRequestId: "batch:1",
      ok: true,
      operation: "readSynchronizedMessageBatch",
      payloadBytes: 456,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH,
      queueDepthAtStart: 2,
      queueWaitMs: 12.3,
      rawPayloadBytes: 123,
      readRequests: 1,
      requestedBytes: 120,
      request: {
        activeTimeline: "log",
        mcapDataRequestId: "batch:1",
        requestedTicks: 2,
        requestedTopics: 2,
        timeRangeNs: ["100", "200"],
        topics: ["/LIDAR_TOP", "/CAM_FRONT"],
      },
      requestId: 7,
      resultMessages: 1,
      resultWindows: 1,
      runMs: 45.6,
      sourceKey: "source:1",
      transferables: 1,
    });
  });
});

function createWindow(): McapSynchronizedMessageWindow {
  const message = {
    activeTimeline: "log" as const,
    channelId: 1,
    decoded: {
      decoderId: "decoder",
      decoderVersion: "1",
      output: {
        attributes: {},
        resourceHints: {
          sizeBytes: 456,
        },
      },
      payload: {
        encoding: "protobuf",
      },
    },
    encodedPayloadBytes: 123,
    logTimeNs: 100n,
    publishTimeNs: 100n,
    sequence: 1,
    timelineTimeNs: 100n,
    topic: "/LIDAR_TOP",
  };

  return {
    activeTimeline: "log",
    endTimeNs: 100n,
    messages: [message],
    messagesByTopic: {
      "/LIDAR_TOP": [message],
    },
    startTimeNs: 100n,
    streamPolicies: {},
    timeNs: 100n,
  };
}
