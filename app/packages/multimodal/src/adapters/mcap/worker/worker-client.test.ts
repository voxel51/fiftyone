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
import { dehydrateMcapFrameTransformSet } from "../transforms/wire";
import type { McapFrameTransformSet } from "../transforms/types";
import { EPISODE_READ_CANCELLED_MESSAGE } from "../../../ports";

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
        fillSlotClass: "priority",
        headers: { Authorization: "token" },
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

  it("preserves an explicit priority on ordinary resource calls", async () => {
    const { client, workers } = createClientHarness();
    const request = createTimelineRequest();

    const range = client.readTimelineRange(request, { priority: "bulk" });

    expect(workers[0].messages[1]).toMatchObject({
      id: 1,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.BULK_HISTORY,
      type: "readTimelineRange",
    });

    workers[0].respond({
      id: 1,
      ok: true,
      result: createTimelineRange(1n, 2n),
    });
    await expect(range).resolves.toEqual(createTimelineRange(1n, 2n));
  });
  it("isolates paused inspection from active playback workers", async () => {
    const { client, workers } = createClientHarness();
    const source = createSource("source:1");
    const rawRequest = {
      source,
      timeNs: 10n,
      topic: "/imu",
    };

    const inspection = client.readRawMessageRecord(rawRequest, {
      priority: "inspection",
    });
    const playback = client.readSynchronizedMessageBatch({
      source,
      timeNs: [10n],
      topics: ["/camera"],
    });

    expect(workers).toHaveLength(2);
    expect(workers[0].messages[0]).toMatchObject({
      payload: { fillSlotClass: "background", lane: "inspection" },
      type: "init",
    });
    expect(workers[0].messages[1]).toMatchObject({
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.PAUSED_INSPECTION,
      type: "readRawMessageRecord",
    });
    expect(workers[1].messages[0]).toMatchObject({
      payload: { fillSlotClass: "priority", lane: "foreground" },
      type: "init",
    });
    expect(workers[1].messages[1]).toMatchObject({
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH,
      type: "readSynchronizedMessageBatch",
    });

    workers[1].respond({ id: 1, ok: true, result: [] });
    await expect(playback).resolves.toEqual([]);
    workers[0].respond({
      id: 1,
      ok: true,
      result: {
        messageEncoding: "json",
        schemaName: null,
        status: "empty",
        topic: "/imu",
        validFromNs: 0n,
        validUntilNs: 11n,
      },
    });
    await expect(inspection).resolves.toMatchObject({ status: "empty" });
  });
  it("emits worker transport progress by lane", async () => {
    const { client, workers } = createClientHarness();
    const onTransport = vi.fn();
    const unsubscribe = client.subscribeTransport?.(onTransport);
    const range = client.readTimelineRange(createTimelineRequest());
    const worker = workers[0];
    const snapshot = {
      busyMs: 100,
      capturedAtMs: 200,
      fetchedBytes: 1_000,
      reads: 1,
    };

    worker.respond({
      ok: true,
      transport: snapshot,
      type: "transport",
    });

    expect(onTransport).toHaveBeenCalledWith({
      lane: "interactive",
      snapshot,
    });

    worker.respond({ id: 1, ok: true, result: createTimelineRange(1n, 2n) });
    await expect(range).resolves.toEqual(createTimelineRange(1n, 2n));

    unsubscribe?.();
    worker.respond({
      ok: true,
      transport: {
        busyMs: 200,
        capturedAtMs: 300,
        fetchedBytes: 2_000,
        reads: 2,
      },
      type: "transport",
    });
    expect(onTransport).toHaveBeenCalledTimes(1);
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

  it("sends explicit message browsing reads at current-frame priority", async () => {
    const { client, workers } = createClientHarness();
    const source = createSource("source:1");
    const indexResult = {
      entries: [{ cursor: "cursor-2", logTimeNs: 2n }],
      hasNext: false,
      hasPrevious: false,
      selectedCursor: "cursor-2",
    };

    const indexWindow = client.readMessageIndexWindow?.({
      after: 5,
      anchorCursor: "cursor-2",
      before: 5,
      source,
      topic: "/camera",
    });
    const worker = workers[0];
    expect(worker.messages[1]).toMatchObject({
      id: 1,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      type: "readMessageIndexWindow",
    });
    worker.respond({ id: 1, ok: true, result: indexResult });
    await expect(indexWindow).resolves.toEqual(indexResult);

    const exactResult = {
      cursor: "cursor-2",
      logTimeNs: 2n,
      messageEncoding: "json",
      schemaName: "test.State",
      status: "ok" as const,
      topic: "/camera",
      validFromNs: 2n,
      validUntilNs: 3n,
    };
    const exactRecord = client.readRawMessageAtCursor?.({
      cursor: "cursor-2",
      source,
      topic: "/camera",
    });
    expect(worker.messages[2]).toMatchObject({
      id: 2,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      type: "readRawMessageAtCursor",
    });
    worker.respond({ id: 2, ok: true, result: exactResult });
    await expect(exactRecord).resolves.toEqual(exactResult);
  });

  it("sends frame transform bootstrap reads at idle-prefetch priority", async () => {
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
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
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

  it("keeps current media on a separate worker from placement transforms", async () => {
    const { client, workers } = createClientHarness();
    const source = createSource("source:1");
    const transformRequest = {
      endTimeNs: 20n,
      source,
      startTimeNs: 10n,
    };

    const transforms = client.readFrameTransformWindow(transformRequest);
    const current = client.readSynchronizedMessages({
      source,
      timeNs: 15n,
      topics: ["/camera"],
    });

    expect(workers).toHaveLength(2);
    expect(workers[0].messages[1]).toMatchObject({
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLACEMENT_FRAME,
      type: "readFrameTransformWindow",
    });
    expect(workers[1].messages[1]).toMatchObject({
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      type: "readSynchronizedMessages",
    });

    const currentWindow = createSynchronizedWindow(15n);
    workers[1].respond({ id: 1, ok: true, result: currentWindow });
    await expect(current).resolves.toEqual(currentWindow);

    workers[0].respond({
      id: 1,
      ok: true,
      result: structuredClone(dehydrateMcapFrameTransformSet({ samples: [] })),
    });
    await expect(transforms).resolves.toEqual({ samples: [] });
  });

  it("cancels placement transforms superseded by a newer playhead", async () => {
    const { client, workers } = createClientHarness();
    const source = createSource("source:1");
    const stale = client.readFrameTransformWindow({
      endTimeNs: 20n,
      source,
      startTimeNs: 10n,
    });
    const latest = client.readFrameTransformWindow({
      endTimeNs: 40n,
      source,
      startTimeNs: 30n,
    });
    const worker = workers[0];

    await expect(stale).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);
    expect(worker.messages.slice(1)).toEqual([
      expect.objectContaining({
        id: 1,
        type: "readFrameTransformWindow",
      }),
      { id: 1, type: "cancel" },
      expect.objectContaining({
        id: 2,
        payload: expect.objectContaining({ endTimeNs: 40n }),
        type: "readFrameTransformWindow",
      }),
    ]);

    worker.respond({
      id: 2,
      ok: true,
      result: structuredClone(dehydrateMcapFrameTransformSet({ samples: [] })),
    });
    await expect(latest).resolves.toEqual({ samples: [] });
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

  it("hydrates worker references from a pinned main-thread decoded record", async () => {
    const { client, workers } = createClientHarness();
    const request = {
      timeNs: [1n],
      source: createSource("source:1"),
      topics: ["/camera"],
    };
    const decoded = {
      ...createCacheableDecodedMessage(1n),
      recordId: "camera-record\0log\0auto",
    };

    const first = client.readSynchronizedMessageBatch(request);
    const worker = workers[0];
    worker.respond({
      id: 1,
      ok: true,
      result: [createSynchronizedWindowWithMessage(decoded)],
    });
    const [firstWindow] = await first;

    const second = client.readSynchronizedMessageBatch(request);
    expect(worker.messages.at(-1)).toMatchObject({
      retainedDecodedRecordIds: [decoded.recordId],
      type: "readSynchronizedMessageBatch",
    });
    const reference = {
      kind: "retained-decoded-message" as const,
      recordId: decoded.recordId,
      timelineTimeNs: decoded.timelineTimeNs,
      topic: decoded.topic,
    };
    worker.respond({
      id: 2,
      ok: true,
      result: [createSynchronizedWindowWithMessage(reference)],
    });
    const [secondWindow] = await second;

    expect(secondWindow?.messages[0]).toBe(firstWindow?.messages[0]);
    expect(secondWindow?.messagesByTopic["/camera"]?.[0]).toBe(
      firstWindow?.messages[0],
    );
  });

  it("reuses playback-batch records across the interactive scrub lane", async () => {
    const { client, workers } = createClientHarness();
    const source = createSource("source:1");
    const decoded = {
      ...createCacheableDecodedMessage(1n),
      recordId: "latched-record\0activeTimeline=log\0auto",
    };
    const playback = client.readSynchronizedMessageBatch({
      source,
      timeNs: [1n],
      topics: ["/camera"],
    });
    workers[0].respond({
      id: 1,
      ok: true,
      result: [createSynchronizedWindowWithMessage(decoded)],
    });
    const [playbackWindow] = await playback;

    const scrub = client.readSynchronizedMessages({
      source,
      timeNs: 2n,
      topics: ["/camera"],
    });
    const interactiveWorker = workers[1];
    expect(interactiveWorker.messages.at(-1)).toMatchObject({
      retainedDecodedRecordIds: [decoded.recordId],
      type: "readSynchronizedMessages",
    });
    const reference = {
      kind: "retained-decoded-message" as const,
      recordId: decoded.recordId,
      timelineTimeNs: decoded.timelineTimeNs,
      topic: decoded.topic,
    };
    interactiveWorker.respond({
      id: 1,
      ok: true,
      result: createSynchronizedWindowWithMessage(reference),
    });

    await expect(scrub).resolves.toMatchObject({ messages: [decoded] });
    expect((await scrub).messages[0]).toBe(playbackWindow?.messages[0]);
  });

  it("restarts worker isolates when active source ownership changes", async () => {
    const { client, workers } = createClientHarness();
    const firstSource = createSource("source:1");
    const secondSource = createSource("source:2");
    client.activateSource?.(firstSource);
    const first = client.readSynchronizedMessageBatch({
      source: firstSource,
      timeNs: [1n],
      topics: ["/camera"],
    });
    const worker = workers[0];
    const decoded = {
      ...createCacheableDecodedMessage(1n),
      recordId: "same-physical-record\0log\0auto",
    };
    worker.respond({
      id: 1,
      ok: true,
      result: [createSynchronizedWindowWithMessage(decoded)],
    });
    await first;

    client.activateSource?.(secondSource);
    expect(worker.messages.at(-1)).toEqual({ type: "dispose" });
    expect(worker.terminate).toHaveBeenCalledOnce();
    const second = client.readSynchronizedMessageBatch({
      source: secondSource,
      timeNs: [1n],
      topics: ["/camera"],
    });
    expect(workers).toHaveLength(2);
    const replacement = workers[1];
    expect(replacement.messages.at(-1)).not.toHaveProperty(
      "retainedDecodedRecordIds",
    );
    replacement.respond({ id: 2, ok: true, result: [] });
    await expect(second).resolves.toEqual([]);
  });

  it("keeps worker isolates warm when the same source reclaims ownership", async () => {
    const { client, workers } = createClientHarness();
    const source = createSource("source:1");
    client.activateSource?.(source);
    const first = client.readSynchronizedMessageBatch({
      source,
      timeNs: [1n],
      topics: ["/camera"],
    });
    const worker = workers[0];
    const decoded = {
      ...createCacheableDecodedMessage(1n),
      recordId: "renderer-owned-record\0log\0auto",
    };
    worker.respond({
      id: 1,
      ok: true,
      result: [createSynchronizedWindowWithMessage(decoded)],
    });
    await first;

    client.releaseRetainedResources?.();

    expect(worker.messages.at(-1)).toEqual({
      type: "releaseRetainedResources",
    });
    expect(worker.terminate).not.toHaveBeenCalled();

    client.activateSource?.(source);
    const second = client.readSynchronizedMessageBatch({
      source,
      timeNs: [1n],
      topics: ["/camera"],
    });
    expect(workers).toHaveLength(1);
    expect(worker.messages.at(-1)).not.toHaveProperty(
      "retainedDecodedRecordIds",
    );
    worker.respond({ id: 2, ok: true, result: [] });
    await expect(second).resolves.toEqual([]);
  });

  it("restarts worker isolates before a different source reclaims ownership", async () => {
    const { client, workers } = createClientHarness();
    const firstSource = createSource("source:1");
    const secondSource = createSource("source:2");
    client.activateSource?.(firstSource);
    const first = client.readSynchronizedMessageBatch({
      source: firstSource,
      timeNs: [1n],
      topics: ["/camera"],
    });
    const worker = workers[0];
    worker.respond({ id: 1, ok: true, result: [] });
    await first;

    client.releaseRetainedResources?.();
    expect(worker.messages.at(-1)).toEqual({
      type: "releaseRetainedResources",
    });
    expect(worker.terminate).not.toHaveBeenCalled();

    // A redundant lifecycle release must not forget which source left the
    // warm isolate behind.
    client.releaseRetainedResources?.();

    client.activateSource?.(secondSource);
    expect(worker.messages.at(-1)).toEqual({ type: "dispose" });
    expect(worker.terminate).toHaveBeenCalledOnce();
    const second = client.readSynchronizedMessageBatch({
      source: secondSource,
      timeNs: [1n],
      topics: ["/camera"],
    });
    expect(workers).toHaveLength(2);
    workers[1].respond({ id: 2, ok: true, result: [] });
    await expect(second).resolves.toEqual([]);
  });

  it("does not lease records before a request-driven source switch", async () => {
    const { client, workers } = createClientHarness();
    const firstSource = createSource("source:1");
    const secondSource = createSource("source:2");
    const first = client.readSynchronizedMessageBatch({
      source: firstSource,
      timeNs: [1n],
      topics: ["/camera"],
    });
    const decoded = {
      ...createCacheableDecodedMessage(1n),
      recordId: "same-physical-record\0log\0auto",
    };
    workers[0].respond({
      id: 1,
      ok: true,
      result: [createSynchronizedWindowWithMessage(decoded)],
    });
    await first;

    const second = client.readSynchronizedMessageBatch({
      source: secondSource,
      timeNs: [1n],
      topics: ["/camera"],
    });
    expect(workers).toHaveLength(2);
    expect(workers[1].messages.at(-1)).not.toHaveProperty(
      "retainedDecodedRecordIds",
    );
    workers[1].respond({ id: 2, ok: true, result: [] });
    await expect(second).resolves.toEqual([]);
  });

  it("clears the store after an invalid retained-record reference", async () => {
    const { client, workers } = createClientHarness();
    const request = {
      timeNs: [1n],
      source: createSource("source:1"),
      topics: ["/camera"],
    };
    const pending = client.readSynchronizedMessageBatch(request);
    const worker = workers[0];
    worker.respond({
      id: 1,
      ok: true,
      result: [
        createSynchronizedWindowWithMessage({
          kind: "retained-decoded-message",
          recordId: "not-leased",
          timelineTimeNs: 1n,
          topic: "/camera",
        }),
      ],
    });

    await expect(pending).rejects.toThrow("unavailable retained MCAP record");
    const retry = client.readSynchronizedMessageBatch(request);
    expect(worker.messages.at(-1)).not.toHaveProperty(
      "retainedDecodedRecordIds",
    );
    worker.respond({ id: 2, ok: true, result: [] });
    await expect(retry).resolves.toEqual([]);
  });

  it("cancels speculative idle reads and notifies the idle worker", async () => {
    const { client, workers } = createClientHarness();
    const request = {
      timeNs: [1n, 2n],
      source: createSource("source:1"),
      topics: ["/camera"],
    };

    const idleBatch = client.readSynchronizedMessageBatch(request, {
      priority: "idle",
    });
    const idleWorker = workers[0];

    client.cancelIdleReads?.();

    await expect(idleBatch).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);
    expect(idleWorker.messages.at(-1)).toMatchObject({
      id: 1,
      type: "cancel",
    });

    // A late worker response for the cancelled id must not break anything.
    idleWorker.respond({ error: "late", id: 1, ok: false });
  });

  it("cancels obsolete playback runway without touching idle batches", async () => {
    const { client, workers } = createClientHarness();
    const request = {
      timeNs: [1n, 2n],
      source: createSource("source:1"),
      topics: ["/camera"],
    };

    const runway = client.readSynchronizedMessageBatch(request);
    const foregroundWorker = workers[0];
    const idle = client.readSynchronizedMessageBatch(request, {
      priority: "idle",
    });
    const idleWorker = workers[1];

    client.cancelRunwayReads?.();

    await expect(runway).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);
    expect(foregroundWorker.messages.at(-1)).toEqual({
      id: 1,
      type: "cancel",
    });
    expect(idleWorker.messages.at(-1)).toMatchObject({
      type: "readSynchronizedMessageBatch",
    });

    idleWorker.respond({ id: 1, ok: true, result: [] });
    await expect(idle).resolves.toEqual([]);
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

  it("uses a separate interactive worker while idle-prefetch work is pending", async () => {
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
    expect(workers[1].messages[0]).toMatchObject({
      payload: {
        fillSlotClass: "priority",
      },
      type: "init",
    });

    const currentWindow = createSynchronizedWindow(1n);
    workers[1].respond({ id: 1, ok: true, result: currentWindow });
    await expect(current).resolves.toEqual(currentWindow);

    workers[0].respond({ id: 1, ok: true, result: [] });
    await expect(idle).resolves.toEqual([]);
  });

  it("admits a current frame while foreground playback is unresolved", async () => {
    const { client, workers } = createClientHarness();
    const source = createSource("source:1");
    const playback = client.readSynchronizedMessageBatch({
      timeNs: [1n, 2n],
      source,
      topics: ["/camera"],
    });
    const current = client.readSynchronizedMessages({
      timeNs: 1n,
      source,
      topics: ["/labels"],
    });

    expect(workers).toHaveLength(2);
    expect(workers[0].messages).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          fillSlotClass: "priority",
        }),
        type: "init",
      }),
      expect.objectContaining({
        id: 1,
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH,
        type: "readSynchronizedMessageBatch",
      }),
    ]);
    expect(workers[1].messages).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          fillSlotClass: "priority",
        }),
        type: "init",
      }),
      expect.objectContaining({
        id: 1,
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
        type: "readSynchronizedMessages",
      }),
    ]);

    const currentWindow = createSynchronizedWindow(1n);
    workers[1].respond({ id: 1, ok: true, result: currentWindow });
    await expect(current).resolves.toEqual(currentWindow);

    workers[0].respond({ id: 1, ok: true, result: [] });
    await expect(playback).resolves.toEqual([]);
  });

  it("cancels an older current-frame request for an overlapping topic", async () => {
    const { client, workers } = createClientHarness();
    const source = createSource("source:1");
    const stale = client.readSynchronizedMessages({
      timeNs: 1n,
      source,
      topics: ["/lidar", "/radar"],
    });
    const latest = client.readSynchronizedMessages({
      timeNs: 2n,
      source,
      topics: ["/lidar"],
    });
    const worker = workers[0];

    await expect(stale).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);
    expect(worker.messages.slice(1)).toEqual([
      expect.objectContaining({
        id: 1,
        type: "readSynchronizedMessages",
      }),
      { id: 1, type: "cancel" },
      expect.objectContaining({
        id: 2,
        payload: expect.objectContaining({ timeNs: 2n }),
        type: "readSynchronizedMessages",
      }),
    ]);

    const window = createSynchronizedWindow(2n);
    worker.respond({ id: 2, ok: true, result: window });
    await expect(latest).resolves.toEqual(window);
  });

  it("restarts workers and fails stale reads under explicit ownership", async () => {
    const { client, workers } = createClientHarness();

    client.activateSource?.(createSource("source:1"));
    const first = client.readTimelineRange(createTimelineRequest("source:1"));
    const worker = workers[0];

    client.activateSource?.(createSource("source:2"));

    // Switching first settles the pending read with the benign cancellation
    // error, then ends the isolate before the next source can allocate in it.
    await expect(first).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);
    expect(worker.messages.slice(-2)).toEqual([
      { id: 1, type: "cancel" },
      { type: "dispose" },
    ]);
    expect(worker.terminate).toHaveBeenCalledOnce();

    // A late read for the retired source fails fast without flipping
    // ownership back.
    await expect(
      client.readTimelineRange(createTimelineRequest("source:1")),
    ).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);

    // The active source proceeds on a fresh worker.
    const second = client.readTimelineRange(createTimelineRequest("source:2"));
    expect(workers).toHaveLength(2);
    const secondWorker = workers[1];
    secondWorker.respond({
      id: 2,
      ok: true,
      result: createTimelineRange(2n, 3n),
    });
    await expect(second).resolves.toEqual(createTimelineRange(2n, 3n));

    // Back-navigation re-activates the earlier source legitimately.
    client.activateSource?.(createSource("source:1"));
    expect(secondWorker.terminate).toHaveBeenCalledOnce();
    const third = client.readTimelineRange(createTimelineRequest("source:1"));
    expect(workers).toHaveLength(3);
    workers[2].respond({
      id: 3,
      ok: true,
      result: createTimelineRange(1n, 2n),
    });
    await expect(third).resolves.toEqual(createTimelineRange(1n, 2n));
  });

  it("cancels in-flight streams when a declared switch preempts them", async () => {
    const { client, workers } = createClientHarness();

    client.activateSource?.(createSource("source:1"));
    const stream = client.readDecodedMessages({
      source: createSource("source:1"),
      topics: ["/camera"],
    });
    const first = stream.next();
    const worker = workers[0];

    client.activateSource?.(createSource("source:2"));

    // The consumer settles with the benign cancelled error even though a
    // dropped queued job would never produce a worker response.
    await expect(first).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);
    expect(worker.messages.slice(-2)).toEqual([
      { id: 1, type: "cancel" },
      { type: "dispose" },
    ]);
    expect(worker.terminate).toHaveBeenCalledOnce();
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

  it("forwards per-stream abort to the worker and ignores a late reply", async () => {
    const { client, workers } = createClientHarness();
    const controller = new AbortController();
    const stream = client.readDecodedMessages(
      { source: createSource("source:1"), topics: ["/camera"] },
      { signal: controller.signal },
    );
    const first = stream.next();
    const worker = workers[0];

    controller.abort();

    await expect(first).rejects.toThrow(EPISODE_READ_CANCELLED_MESSAGE);
    expect(worker.messages.at(-1)).toEqual({ id: 1, type: "cancel" });
    worker.respond({
      done: false,
      id: 1,
      item: createDecodedMessage(1n),
      ok: true,
      stream: true,
    });
    expect(
      worker.messages.filter((message) => message.type === "cancel"),
    ).toHaveLength(1);
  });

  it("can demote decoded-message streams to idle-prefetch priority", async () => {
    // Callers can still opt into ordinary idle prefetch for bounded decoded
    // streams; full-history context reads use the separate bulk lane below.
    const { client, workers } = createClientHarness();
    const stream = client.readDecodedMessages(
      {
        source: createSource("source:1"),
        topics: ["/odom"],
      },
      { priority: "idle" },
    );
    const first = stream.next();

    expect(workers[0].messages[1]).toMatchObject({
      id: 1,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
      type: "readDecodedMessages",
    });

    workers[0].respond({
      done: true,
      id: 1,
      ok: true,
      stream: true,
    });

    await expect(first).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it("routes bulk decoded-message streams to the bulk lane", async () => {
    const { client, workers } = createClientHarness();
    const stream = client.readDecodedMessages(
      {
        source: createSource("source:1"),
        topics: ["/odom"],
      },
      { priority: "bulk" },
    );
    const first = stream.next();
    const worker = workers[0];

    expect(worker.messages[0]).toMatchObject({
      payload: {
        headers: { Authorization: "token" },
        origin: "http://localhost:5151",
        pathPrefix: "/proxy",
      },
      type: "init",
    });
    expect(worker.messages[1]).toMatchObject({
      id: 1,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.BULK_HISTORY,
      type: "readDecodedMessages",
    });

    worker.respond({
      done: true,
      id: 1,
      ok: true,
      stream: true,
    });

    await expect(first).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it("releases the bulk worker once its queue drains", async () => {
    const { client, workers } = createClientHarness();
    const stream = client.readDecodedMessages(
      {
        source: createSource("source:1"),
        topics: ["/odom"],
      },
      { priority: "bulk" },
    );
    const first = stream.next();
    const worker = workers[0];

    worker.respond({
      done: true,
      id: 1,
      ok: true,
      stream: true,
    });
    await expect(first).resolves.toEqual({ done: true, value: undefined });

    // Bulk work is one-shot: the drained lane's worker (and its caches) go
    // away instead of lingering for the rest of the session.
    expect(worker.messages.at(-1)).toMatchObject({ type: "dispose" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    // The next bulk read lazily recreates the lane's worker.
    const next = client.readDecodedMessages(
      {
        source: createSource("source:1"),
        topics: ["/pose"],
      },
      { priority: "bulk" },
    );
    const nextFirst = next.next();
    const recreated = workers.at(-1);
    expect(recreated).not.toBe(worker);
    expect(recreated?.messages[0]).toMatchObject({
      payload: {
        headers: { Authorization: "token" },
        origin: "http://localhost:5151",
        pathPrefix: "/proxy",
      },
      type: "init",
    });
    const nextRequest = recreated?.messages[1];
    if (nextRequest?.type !== "readDecodedMessages") {
      throw new Error("Expected a decoded-message request on the new worker");
    }
    recreated?.respond({
      done: true,
      id: nextRequest.id,
      ok: true,
      stream: true,
    });
    await expect(nextFirst).resolves.toEqual({ done: true, value: undefined });
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

function createSynchronizedWindowWithMessage<
  Message extends { readonly timelineTimeNs: bigint; readonly topic: string },
>(message: Message) {
  return {
    activeTimeline: "log" as const,
    endTimeNs: message.timelineTimeNs,
    messages: [message],
    messagesByTopic: { [message.topic]: [message] },
    startTimeNs: message.timelineTimeNs,
    streamPolicies: {},
    timeNs: message.timelineTimeNs,
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

function createCacheableDecodedMessage(timelineTimeNs: bigint) {
  const message = createDecodedMessage(timelineTimeNs);
  const buffer = new ArrayBuffer(32);
  return {
    ...message,
    decoded: {
      ...message.decoded,
      output: {
        ...message.decoded.output,
        resourceHints: {
          sizeBytes: buffer.byteLength,
          transferables: [buffer],
        },
      },
    },
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
