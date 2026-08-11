import { byteSourceAccessKey } from "../../../query/bytes";
import {
  isMcapCostDebugEnabled,
  isMcapLatencyDebugEnabled,
  isMcapRecordOwnershipDebugEnabled,
} from "../instrumentation/host/mcap-debug-flags";
import { recordMcapCostEvent } from "../instrumentation/host/mcap-cost-debug";
import { fnv1aFingerprint } from "../../../utils/fnv1a";
import {
  recordMcapCostWorkerAttribution,
  recordMcapCostWorkerCancellation,
  type McapCostWorkerCancellationReason,
} from "../instrumentation/host/mcap-cost-worker-attribution";
import { recordMcapWorkerAttribution } from "../instrumentation/host/mcap-latency-debug";
import { hydrateMcapFrameTransformSet } from "../transforms/wire";
import { mcapPlaybackWorkerOperation } from "../worker/playback-worker-rpc";
import { McapPlaybackWorkerTransport } from "../worker/playback-worker-transport";
import {
  DecodedRecordStore,
  isRetainedDecodedMessageReference,
  type DecodedRecordLease,
  type DecodedRecordStoreEvent,
} from "../worker/decoded-record-store";
import type {
  McapLaneTransportSnapshot,
  McapTransportLane,
  McapTransportSnapshot,
} from "../worker/transport-meter";
import { workerFetchParameters } from "../worker/worker-resource-client";
import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerPriority,
  type McapPlaybackWorkerRequest,
  type McapPlaybackWorkerRequestPayloadByType,
  type McapPlaybackWorkerResponse,
  type McapPlaybackWorkerResultByType,
  type McapPlaybackWorkerSynchronizedMessage,
  type McapPlaybackWorkerSynchronizedWindow,
  type McapPlaybackWorkerStreamItemByType,
  type McapPlaybackWorkerStreamType,
  type McapPlaybackWorkerUnaryType,
} from "../worker/playback-worker-types";
import { errorMessage } from "../../../utils/errors";
import { EpisodeReadCancelledError } from "../../../ports";
import type { McapFrameTransformSet } from "../transforms/types";
import type {
  McapDecodedMessage,
  McapEnumerateNumericFieldsRequest,
  McapNumericSeriesResult,
  McapNumericSeriesSliceResult,
  McapMessageIndexWindowResult,
  McapPointCloudChannelResult,
  McapReadBoundedMessagesRequest,
  McapReadBoundedMessagesResult,
  McapReadDecodedMessagesRequest,
  McapReadFrameTransformBootstrapRequest,
  McapReadFrameTransformWindowRequest,
  McapRawMessageRecordResult,
  McapReadMessageIndexWindowRequest,
  McapReadNumericSeriesRequest,
  McapReadNumericSeriesSliceRequest,
  McapReadPointCloudChannelRequest,
  McapReadRawMessageRecordRequest,
  McapReadRawMessageAtCursorRequest,
  McapReadSynchronizedMessageBatchRequest,
  McapReadSynchronizedMessagesRequest,
  McapRecordingInventory,
  McapResourceReadOptions,
  McapReadTopicsRequest,
  McapReadTopicTimeBoundsRequest,
  McapReadTimelineRangeRequest,
  McapReadTransformTopologyRequest,
  McapTransformTopologyResult,
  McapResourceClient,
  McapSynchronizedMessageWindow,
  McapTimelineRange,
  McapTopicNumericFields,
  McapTopicTimeBounds,
} from "../contracts/index";
import {
  haveMcapSupersessionKeyOverlap,
  mcapForegroundSupersessionKeys,
} from "../worker/playback-worker-supersession";
import { createMcapWorkerSlotLifecycle } from "../worker/worker-slot-lifecycle";

type WorkerLane = {
  readonly name: McapTransportLane;
  readonly transport: McapPlaybackWorkerTransport;
  worker?: Worker;
};

/**
 * Options for creating a worker-backed MCAP resource client.
 */
export interface CreateWorkerMcapResourceClientOptions {
  readonly workerFactory?: () => Worker;
}

/**
 * Creates a worker-backed MCAP resource client for synchronized playback.
 */
export function createWorkerMcapResourceClient(
  options: CreateWorkerMcapResourceClientOptions = {},
): McapResourceClient {
  if (!options.workerFactory && typeof Worker === "undefined") {
    throw new Error("MCAP playback workers are not available");
  }

  return new WorkerMcapResourceClient(options);
}

class WorkerMcapResourceClient implements McapResourceClient {
  private activeSourceKey = "";
  private releasedSourceKey = "";
  private foregroundGeneration = 0;
  private disposed = false;
  private explicitOwnership = false;
  private readonly decodedRecords = new DecodedRecordStore({
    onEvent: (event) => this.recordDecodedRecordStoreEvent(event),
  });
  private readonly transportListeners = new Set<
    (sample: McapLaneTransportSnapshot) => void
  >();
  private readonly interactiveLane = this.createLane("interactive");
  private readonly foregroundLane = this.createLane("foreground");
  private readonly inspectionLane = this.createLane("inspection");
  private readonly idleLane = this.createLane("idle");
  private readonly bulkLane = this.createLane("bulk");
  private readonly lanes = [
    this.interactiveLane,
    this.foregroundLane,
    this.inspectionLane,
    this.idleLane,
    this.bulkLane,
  ] as const;
  private readonly workerLifecycle = createMcapWorkerSlotLifecycle<
    WorkerLane,
    McapPlaybackWorkerRequest,
    McapPlaybackWorkerResponse
  >({
    createWorker: () => this.createWorker(),
    disposeRequest: { type: "dispose" },
    handleResponse: (lane, response) => lane.transport.handleResponse(response),
    rejectAll: (lane, reason) => lane.transport.rejectAll(reason),
    startupErrorMessage: "MCAP worker startup failed",
    workerErrorMessage: "MCAP worker error",
  });

  constructor(
    private readonly options: CreateWorkerMcapResourceClientOptions,
  ) {}

  dispose() {
    this.disposed = true;
    this.releasedSourceKey = "";
    this.decodedRecords.clear();
    this.transportListeners.clear();
    this.resetWorkers("MCAP worker disposed");
  }

  releaseRetainedResources() {
    if (this.disposed) return;
    this.cancelAllPendingReads();
    this.decodedRecords.clear();
    // Preserve the last owned source across redundant release calls. This
    // keeps a later, different source from reusing the old worker isolates.
    if (this.activeSourceKey) {
      this.releasedSourceKey = this.activeSourceKey;
    }
    this.activeSourceKey = "";
    this.foregroundGeneration += 1;
    for (const lane of this.lanes) {
      const worker = lane.worker;
      if (!worker) continue;
      try {
        const releaseRequest: McapPlaybackWorkerRequest = {
          type: "releaseRetainedResources",
        };
        worker.postMessage(releaseRequest);
      } catch {
        this.resetLane(lane, "MCAP worker resource release failed");
      }
    }
  }

  subscribeTransport(
    listener: (sample: McapLaneTransportSnapshot) => void,
  ): () => void {
    this.transportListeners.add(listener);
    return () => {
      this.transportListeners.delete(listener);
    };
  }

  activateSource(source: Parameters<typeof byteSourceAccessKey>[0]) {
    const sourceKey = byteSourceAccessKey(source);
    this.explicitOwnership = true;
    if (this.activeSourceKey === sourceKey) {
      return;
    }
    const previousSourceKey = this.activeSourceKey || this.releasedSourceKey;
    // Cancel first so pending work rejects with the ordinary benign
    // cancellation error. If ownership is moving to a different recording,
    // end the isolates before its first read so allocator high-water from the
    // prior source cannot compound with the next one. A quick round trip back
    // to the same source can reuse the soft-released isolates and avoid paying
    // worker module/WASM startup again.
    this.cancelAllPendingReads();
    if (previousSourceKey && previousSourceKey !== sourceKey) {
      this.resetWorkers("MCAP worker reset for a different owned source");
    }
    this.decodedRecords.clear();
    this.releasedSourceKey = "";
    this.activeSourceKey = sourceKey;
    this.foregroundGeneration += 1;
  }

  // Rejects every pending unary and stream locally and tells each lane's
  // worker to drop or abort the matching jobs. In-flight aborts surface at
  // the next read or decode boundary, so a lane frees up within one
  // boundary rather than after the full stale job.
  private cancelAllPendingReads() {
    for (const lane of this.lanes) {
      const cancelledIds = [
        ...lane.transport.cancelPending(() => true),
        ...lane.transport.cancelStreams(),
      ];
      this.postCancelRequests(lane, cancelledIds, "source-switch");
    }
  }

  cancelIdleReads() {
    // Only the byte-heavy speculative operations: bootstrap/topic/bounds
    // reads also ride the idle lane, but their consumers surface errors as
    // UI states and are cheap enough to let finish.
    const cancelledIds = this.idleLane.transport.cancelPending(
      (pending) =>
        pending.type === "readSynchronizedMessageBatch" ||
        pending.type === "readFrameTransformWindow",
    );
    this.postCancelRequests(this.idleLane, cancelledIds, "idle-preemption");
  }

  cancelRunwayReads() {
    const cancelledIds = this.foregroundLane.transport.cancelPending(
      (pending) => pending.type === "readSynchronizedMessageBatch",
    );
    this.postCancelRequests(
      this.foregroundLane,
      cancelledIds,
      "seek-preemption",
    );
  }

  async *readDecodedMessages(
    request: McapReadDecodedMessagesRequest,
    options?: McapResourceReadOptions,
  ): AsyncGenerator<McapDecodedMessage, void, void> {
    for await (const message of this.streamRequest(
      "readDecodedMessages",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    )) {
      yield message;
    }
  }

  readBoundedMessages(
    request: McapReadBoundedMessagesRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapReadBoundedMessagesResult> {
    return this.request(
      "readBoundedMessages",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    );
  }

  readTimelineRange(
    request: McapReadTimelineRangeRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapTimelineRange> {
    return this.request(
      "readTimelineRange",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    );
  }

  readTopics(
    request: McapReadTopicsRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapRecordingInventory> {
    return this.request(
      "readTopics",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    );
  }

  readTopicTimeBounds(
    request: McapReadTopicTimeBoundsRequest,
  ): Promise<readonly McapTopicTimeBounds[]> {
    return this.request("readTopicTimeBounds", request);
  }

  enumerateNumericFields(
    request: McapEnumerateNumericFieldsRequest,
  ): Promise<readonly McapTopicNumericFields[]> {
    return this.request("enumerateNumericFields", request);
  }

  readNumericSeries(
    request: McapReadNumericSeriesRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapNumericSeriesResult> {
    return this.request(
      "readNumericSeries",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    );
  }

  readNumericSeriesSlice(
    request: McapReadNumericSeriesSliceRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapNumericSeriesSliceResult> {
    return this.request(
      "readNumericSeriesSlice",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    );
  }

  readRawMessageRecord(
    request: McapReadRawMessageRecordRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapRawMessageRecordResult> {
    return this.request(
      "readRawMessageRecord",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    );
  }

  readRawMessageAtCursor(
    request: McapReadRawMessageAtCursorRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapRawMessageRecordResult> {
    return this.request(
      "readRawMessageAtCursor",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    );
  }

  readMessageIndexWindow(
    request: McapReadMessageIndexWindowRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapMessageIndexWindowResult> {
    return this.request(
      "readMessageIndexWindow",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    );
  }

  readPointCloudChannel(
    request: McapReadPointCloudChannelRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapPointCloudChannelResult> {
    return this.request(
      "readPointCloudChannel",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    );
  }

  readFrameTransformBootstrap(
    request: McapReadFrameTransformBootstrapRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapFrameTransformSet> {
    return this.request(
      "readFrameTransformBootstrap",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    ).then(hydrateMcapFrameTransformSet);
  }

  readFrameTransformWindow(
    request: McapReadFrameTransformWindowRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapFrameTransformSet> {
    return this.request(
      "readFrameTransformWindow",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    ).then(hydrateMcapFrameTransformSet);
  }

  readTransformTopology(
    request: McapReadTransformTopologyRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapTransformTopologyResult> {
    return this.request(
      "readTransformTopology",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
    );
  }

  readSynchronizedMessages(
    request: McapReadSynchronizedMessagesRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapSynchronizedMessageWindow> {
    let lease: DecodedRecordLease;
    try {
      lease = this.acquireDecodedRecordLease(request);
    } catch (error) {
      return Promise.reject(error);
    }
    return this.request(
      "readSynchronizedMessages",
      request,
      undefined,
      options?.signal,
      lease.recordIds,
    )
      .then(
        (window) =>
          hydrateSynchronizedWindows([window], lease, this.decodedRecords)[0],
      )
      .then((window) => {
        if (!window) throw new Error("Expected synchronized MCAP window");
        return window;
      })
      .catch((error) => {
        if (error instanceof RetainedDecodedRecordProtocolError) {
          this.decodedRecords.clear();
        }
        throw error;
      })
      .finally(() => lease.release());
  }

  readSynchronizedMessageBatch(
    request: McapReadSynchronizedMessageBatchRequest,
    options?: McapResourceReadOptions,
  ): Promise<readonly McapSynchronizedMessageWindow[]> {
    let lease: DecodedRecordLease;
    try {
      lease = this.acquireDecodedRecordLease(request);
    } catch (error) {
      return Promise.reject(error);
    }
    return this.request(
      "readSynchronizedMessageBatch",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
      options?.signal,
      lease.recordIds,
    )
      .then((windows) =>
        hydrateSynchronizedWindows(windows, lease, this.decodedRecords),
      )
      .catch((error) => {
        if (error instanceof RetainedDecodedRecordProtocolError) {
          this.decodedRecords.clear();
        }
        throw error;
      })
      .finally(() => lease.release());
  }

  private acquireDecodedRecordLease(
    request: Pick<McapReadSynchronizedMessageBatchRequest, "source" | "topics">,
  ): DecodedRecordLease {
    if (this.disposed) {
      throw new Error("MCAP worker client is disposed");
    }
    this.ensureActiveSource(byteSourceAccessKey(request.source));
    return this.decodedRecords.acquire(request.topics);
  }

  private request<Type extends McapPlaybackWorkerUnaryType>(
    type: Type,
    payload: McapPlaybackWorkerRequestPayloadByType[Type],
    priority?: McapPlaybackWorkerPriority,
    signal?: AbortSignal,
    retainedDecodedRecordIds?: readonly string[],
  ): Promise<McapPlaybackWorkerResultByType[Type]> {
    if (this.disposed) {
      return Promise.reject(new Error("MCAP worker client is disposed"));
    }

    const effectivePriority =
      priority ?? mcapPlaybackWorkerOperation(type).priority;
    const sourceKey = byteSourceAccessKey(payload.source);
    try {
      this.ensureActiveSource(sourceKey);
    } catch (error) {
      return Promise.reject(error);
    }
    const lane = this.laneForPriority(effectivePriority);
    const supersessionKeys = mcapForegroundSupersessionKeys({
      generation: this.foregroundGeneration,
      payload,
      priority: effectivePriority,
      sourceKey,
      type,
    });
    if (supersessionKeys.length > 0) {
      const cancelledIds = lane.transport.cancelPending((pending) =>
        haveMcapSupersessionKeyOverlap(
          pending.supersessionKeys,
          supersessionKeys,
        ),
      );
      this.postCancelRequests(lane, cancelledIds, "superseded");
      // A burst of obsolete presentation work is also a seek/scrub signal.
      // Give the byte link back to the newest foreground frame immediately;
      // useful playback-runway work remains on its separate foreground lane.
      if (cancelledIds.length > 0) this.cancelIdleReads();
    }
    return lane.transport.request(
      this.workerForLane(lane, sourceKey),
      sourceKey,
      type,
      payload,
      effectivePriority,
      supersessionKeys,
      signal,
      retainedDecodedRecordIds,
    );
  }

  private async *streamRequest<Type extends McapPlaybackWorkerStreamType>(
    type: Type,
    payload: McapPlaybackWorkerRequestPayloadByType[Type],
    priority?: McapPlaybackWorkerPriority,
    signal?: AbortSignal,
  ): AsyncGenerator<McapPlaybackWorkerStreamItemByType[Type], void, void> {
    if (this.disposed) {
      throw new Error("MCAP worker client is disposed");
    }

    const effectivePriority =
      priority ?? mcapPlaybackWorkerOperation(type).priority;
    const sourceKey = byteSourceAccessKey(payload.source);
    this.ensureActiveSource(sourceKey);
    const lane = this.laneForPriority(effectivePriority);
    try {
      yield* lane.transport.stream(
        this.workerForLane(lane, sourceKey),
        sourceKey,
        type,
        payload,
        effectivePriority,
        signal,
      );
    } finally {
      this.maybeReleaseBulkLane(lane);
    }
  }

  private ensureActiveSource(sourceKey: string) {
    if (this.activeSourceKey === sourceKey) {
      return;
    }

    if (this.explicitOwnership) {
      // Under explicit ownership only activateSource may switch; a request
      // for a non-active source is a dying renderer's late effect.
      throw new EpisodeReadCancelledError();
    }

    // Request-driven switching for callers that never activate a source:
    // terminate stays the safe preemption — request order cannot express
    // ownership, so keep-warm would thrash (0.3 s -> ~4.6 s hops).
    this.resetWorkers("MCAP worker reset for a different source");
    this.decodedRecords.clear();
    this.activeSourceKey = sourceKey;
    this.foregroundGeneration += 1;
  }

  private laneForPriority(priority: McapPlaybackWorkerPriority): WorkerLane {
    if (priority === MCAP_PLAYBACK_WORKER_PRIORITY.BULK_HISTORY) {
      return this.bulkLane;
    }
    if (priority === MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH) {
      return this.idleLane;
    }
    if (priority === MCAP_PLAYBACK_WORKER_PRIORITY.PAUSED_INSPECTION) {
      return this.inspectionLane;
    }
    if (priority === MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME) {
      return this.interactiveLane;
    }
    return this.foregroundLane;
  }

  private workerForLane(lane: WorkerLane, sourceKey: string): Worker {
    if (lane.worker && this.activeSourceKey === sourceKey) {
      return lane.worker;
    }

    this.resetLane(lane, "MCAP worker reset for a different source");
    const costDebug = isMcapCostDebugEnabled();
    const initRequest: McapPlaybackWorkerRequest = {
      payload: {
        ...workerFetchParameters(),
        costDebug,
        // Current-frame and ordinary foreground playback remain eligible for
        // priority fill slots. Inspection has a responsive isolated worker but
        // stays on background admission with idle and bulk work, preserving
        // the reserved slot while playback needs the link.
        fillSlotClass:
          lane.name === "interactive" || lane.name === "foreground"
            ? "priority"
            : "background",
        lane: lane.name,
        latencyDebug: isMcapLatencyDebugEnabled(),
        recordOwnershipDebug: costDebug && isMcapRecordOwnershipDebugEnabled(),
      },
      type: "init",
    };
    return this.workerLifecycle.workerForSlot(lane, initRequest);
  }

  private createWorker(): Worker {
    if (this.options.workerFactory) {
      return this.options.workerFactory();
    }

    return new Worker(
      new URL("../worker/playback-worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
  }

  private createLane(name: McapTransportLane): WorkerLane {
    return {
      name,
      transport: new McapPlaybackWorkerTransport(
        (sourceKey) => this.activeSourceKey === sourceKey,
        (snapshot) => this.emitTransport(name, snapshot),
        (attribution) => {
          recordMcapWorkerAttribution(attribution);
          recordMcapCostWorkerAttribution(attribution);
        },
      ),
    };
  }

  private emitTransport(
    lane: McapTransportLane,
    snapshot: McapTransportSnapshot,
  ): void {
    if (this.transportListeners.size === 0) {
      return;
    }

    const sample: McapLaneTransportSnapshot = { lane, snapshot };
    for (const listener of this.transportListeners) {
      listener(sample);
    }
  }

  private recordDecodedRecordStoreEvent(event: DecodedRecordStoreEvent): void {
    if (!isMcapRecordOwnershipDebugEnabled()) return;
    const operation =
      event.kind === "hit"
        ? "record-index-hit"
        : event.kind === "insert"
          ? "record-index-admit"
          : event.kind === "evict-capacity"
            ? "record-index-evict-capacity"
            : event.kind === "evict-clear"
              ? "record-index-evict-clear"
              : "record-index-skip-capacity";
    recordMcapCostEvent({
      count: 1,
      measurementStatus: "measured",
      operation,
      outputBytes: event.kind === "hit" ? event.sizeBytes : undefined,
      recordIdentity: fnv1aFingerprint("record", event.recordId),
      sourceTopics: [event.topic],
      stage: "record-ownership",
    });
  }

  private postCancelRequests(
    lane: WorkerLane,
    ids: readonly number[],
    reason: McapCostWorkerCancellationReason,
  ): void {
    recordMcapCostWorkerCancellation({
      count: ids.length,
      lane: lane.name,
      reason,
    });
    const worker = lane.worker;
    if (!worker) {
      return;
    }
    for (const id of ids) {
      try {
        const cancelRequest: McapPlaybackWorkerRequest = {
          id,
          type: "cancel",
        };
        worker.postMessage(cancelRequest);
      } catch {
        // The worker may already be gone; local rejection settled callers.
      }
    }
  }

  private resetWorkers(reason: string) {
    for (const lane of this.lanes) {
      this.resetLane(lane, reason);
    }
  }

  // Bulk work is one-shot per file: once the lane's queue drains, its worker
  // exists only to hold reader and decompress caches nobody will read again.
  // Release it; the next bulk request lazily recreates the worker.
  private maybeReleaseBulkLane(lane: WorkerLane) {
    if (lane !== this.bulkLane || !lane.worker || !lane.transport.isIdle()) {
      return;
    }

    this.resetLane(lane, "MCAP bulk lane drained");
  }

  private resetLane(lane: WorkerLane, reason: string) {
    this.workerLifecycle.resetSlot(lane, reason);
  }
}

class RetainedDecodedRecordProtocolError extends Error {}

function hydrateSynchronizedWindows(
  windows: readonly McapPlaybackWorkerSynchronizedWindow[],
  lease: DecodedRecordLease,
  store: DecodedRecordStore,
): readonly McapSynchronizedMessageWindow[] {
  const hydrate = (
    message: McapPlaybackWorkerSynchronizedMessage,
  ): McapDecodedMessage => {
    try {
      return isRetainedDecodedMessageReference(message)
        ? lease.get(message)
        : store.canonicalize(message);
    } catch (error) {
      throw new RetainedDecodedRecordProtocolError(
        errorMessage(error, "Invalid retained MCAP record reference"),
      );
    }
  };

  return windows.map((window) => ({
    ...window,
    messages: window.messages.map(hydrate),
    messagesByTopic: Object.fromEntries(
      Object.entries(window.messagesByTopic).map(([topic, messages]) => [
        topic,
        messages.map(hydrate),
      ]),
    ),
  }));
}

function resourcePriorityToWorkerPriority(
  priority: McapResourceReadOptions["priority"],
): McapPlaybackWorkerPriority | undefined {
  switch (priority) {
    case "bulk":
      return MCAP_PLAYBACK_WORKER_PRIORITY.BULK_HISTORY;
    case "current":
      return MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME;
    case "idle":
      return MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH;
    case "inspection":
      return MCAP_PLAYBACK_WORKER_PRIORITY.PAUSED_INSPECTION;
    case "playback":
      return MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH;
    case undefined:
      return undefined;
  }
}
