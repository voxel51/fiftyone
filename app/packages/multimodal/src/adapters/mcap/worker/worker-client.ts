import { byteSourceAccessKey } from "../../../query/bytes";
import { recordMcapWorkerAttribution } from "../mcap-latency-debug";
import { hydrateMcapFrameTransformSet } from "../frame-transforms";
import { isMcapLatencyDebugEnabled } from "../mcap-debug-flags";
import { mcapPlaybackWorkerOperation } from "./playback-worker-rpc";
import { McapPlaybackWorkerTransport } from "./playback-worker-transport";
import type {
  McapLaneTransportSnapshot,
  McapTransportSnapshot,
} from "./transport-meter";
import { workerFetchParameters } from "./worker-resource-client";
import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerPriority,
  type McapPlaybackWorkerRequest,
  type McapPlaybackWorkerRequestPayloadByType,
  type McapPlaybackWorkerResponse,
  type McapPlaybackWorkerResultByType,
  type McapPlaybackWorkerStreamItemByType,
  type McapPlaybackWorkerStreamType,
  type McapPlaybackWorkerUnaryType,
} from "./playback-worker-types";
import { mcapError, mcapErrorMessage } from "../errors";
import type { McapFrameTransformSet } from "../frame-transform-types";
import type {
  McapDecodedMessage,
  McapReadDecodedMessagesRequest,
  McapReadFrameTransformBootstrapRequest,
  McapReadFrameTransformWindowRequest,
  McapReadSynchronizedMessageBatchRequest,
  McapReadSynchronizedMessagesRequest,
  McapResourceReadOptions,
  McapReadTopicsRequest,
  McapReadTopicTimeBoundsRequest,
  McapReadTimelineRangeRequest,
  McapResourceClient,
  McapSynchronizedMessageWindow,
  McapTimelineRange,
  McapTopicTimeBounds,
} from "../types";
import type { StreamInventory } from "../../../schemas/v1";

type WorkerLaneName = "foreground" | "idle";

type WorkerLane = {
  readonly name: WorkerLaneName;
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
  private disposed = false;
  private readonly transportListeners = new Set<
    (sample: McapLaneTransportSnapshot) => void
  >();
  private readonly foregroundLane: WorkerLane = {
    name: "foreground",
    transport: new McapPlaybackWorkerTransport(
      (sourceKey) => this.activeSourceKey === sourceKey,
      recordMcapWorkerAttribution,
      (snapshot) => this.emitTransport("foreground", snapshot),
    ),
  };
  private readonly idleLane: WorkerLane = {
    name: "idle",
    transport: new McapPlaybackWorkerTransport(
      (sourceKey) => this.activeSourceKey === sourceKey,
      recordMcapWorkerAttribution,
      (snapshot) => this.emitTransport("idle", snapshot),
    ),
  };

  constructor(
    private readonly options: CreateWorkerMcapResourceClientOptions,
  ) {}

  dispose() {
    this.disposed = true;
    this.transportListeners.clear();
    this.resetWorkers("MCAP worker disposed");
  }

  subscribeTransport(
    listener: (sample: McapLaneTransportSnapshot) => void,
  ): () => void {
    this.transportListeners.add(listener);
    return () => {
      this.transportListeners.delete(listener);
    };
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
    const worker = this.idleLane.worker;
    if (!worker) {
      return;
    }
    for (const id of cancelledIds) {
      try {
        const cancelRequest: McapPlaybackWorkerRequest = {
          id,
          type: "cancel",
        };
        worker.postMessage(cancelRequest);
      } catch {
        // The worker may already be gone; local rejection already settled
        // the caller.
      }
    }
  }

  private emitTransport(lane: WorkerLaneName, snapshot: McapTransportSnapshot) {
    if (this.transportListeners.size === 0) {
      return;
    }
    const sample: McapLaneTransportSnapshot = { lane, snapshot };
    for (const listener of this.transportListeners) {
      listener(sample);
    }
  }

  async *readDecodedMessages(
    request: McapReadDecodedMessagesRequest,
    options?: McapResourceReadOptions,
  ): AsyncGenerator<McapDecodedMessage, void, void> {
    for await (const message of this.streamRequest(
      "readDecodedMessages",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
    )) {
      yield message;
    }
  }

  readTimelineRange(
    request: McapReadTimelineRangeRequest,
  ): Promise<McapTimelineRange> {
    return this.request("readTimelineRange", request);
  }

  readTopics(
    request: McapReadTopicsRequest,
  ): Promise<readonly StreamInventory[]> {
    return this.request("readTopics", request);
  }

  readTopicTimeBounds(
    request: McapReadTopicTimeBoundsRequest,
  ): Promise<readonly McapTopicTimeBounds[]> {
    return this.request("readTopicTimeBounds", request);
  }

  readFrameTransformBootstrap(
    request: McapReadFrameTransformBootstrapRequest,
  ): Promise<McapFrameTransformSet> {
    return this.request("readFrameTransformBootstrap", request).then(
      hydrateMcapFrameTransformSet,
    );
  }

  readFrameTransformWindow(
    request: McapReadFrameTransformWindowRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapFrameTransformSet> {
    return this.request(
      "readFrameTransformWindow",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
    ).then(hydrateMcapFrameTransformSet);
  }

  readSynchronizedMessages(
    request: McapReadSynchronizedMessagesRequest,
  ): Promise<McapSynchronizedMessageWindow> {
    return this.request("readSynchronizedMessages", request);
  }

  readSynchronizedMessageBatch(
    request: McapReadSynchronizedMessageBatchRequest,
    options?: McapResourceReadOptions,
  ): Promise<readonly McapSynchronizedMessageWindow[]> {
    return this.request(
      "readSynchronizedMessageBatch",
      request,
      resourcePriorityToWorkerPriority(options?.priority),
    );
  }

  private request<Type extends McapPlaybackWorkerUnaryType>(
    type: Type,
    payload: McapPlaybackWorkerRequestPayloadByType[Type],
    priority?: McapPlaybackWorkerPriority,
  ): Promise<McapPlaybackWorkerResultByType[Type]> {
    if (this.disposed) {
      return Promise.reject(new Error("MCAP worker client is disposed"));
    }

    const effectivePriority =
      priority ?? mcapPlaybackWorkerOperation(type).priority;
    const sourceKey = byteSourceAccessKey(payload.source);
    this.ensureActiveSource(sourceKey);
    const lane = this.laneForPriority(effectivePriority);
    return lane.transport.request(
      this.workerForLane(lane, sourceKey),
      sourceKey,
      type,
      payload,
      effectivePriority,
    );
  }

  private async *streamRequest<Type extends McapPlaybackWorkerStreamType>(
    type: Type,
    payload: McapPlaybackWorkerRequestPayloadByType[Type],
    priority?: McapPlaybackWorkerPriority,
  ): AsyncGenerator<McapPlaybackWorkerStreamItemByType[Type], void, void> {
    if (this.disposed) {
      throw new Error("MCAP worker client is disposed");
    }

    const effectivePriority =
      priority ?? mcapPlaybackWorkerOperation(type).priority;
    const sourceKey = byteSourceAccessKey(payload.source);
    this.ensureActiveSource(sourceKey);
    const lane = this.laneForPriority(effectivePriority);
    yield* lane.transport.stream(
      this.workerForLane(lane, sourceKey),
      sourceKey,
      type,
      payload,
      effectivePriority,
    );
  }

  private ensureActiveSource(sourceKey: string) {
    if (this.activeSourceKey === sourceKey) {
      return;
    }

    this.resetWorkers("MCAP worker reset for a different source");
    this.activeSourceKey = sourceKey;
  }

  private laneForPriority(priority: McapPlaybackWorkerPriority): WorkerLane {
    return priority === MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH
      ? this.idleLane
      : this.foregroundLane;
  }

  private workerForLane(lane: WorkerLane, sourceKey: string): Worker {
    if (lane.worker && this.activeSourceKey === sourceKey) {
      return lane.worker;
    }

    this.resetLane(lane, "MCAP worker reset for a different source");
    let worker: Worker | undefined;
    try {
      worker = this.createWorker();
      // Wire handlers before init so a synchronous postMessage failure or very
      // early worker response goes through the same transport/reset paths.
      lane.worker = worker;
      worker.onmessage = (event: MessageEvent<McapPlaybackWorkerResponse>) =>
        lane.transport.handleResponse(event.data);
      worker.onerror = (event) => {
        this.resetLane(lane, event.message || "MCAP worker error");
      };

      const initRequest: McapPlaybackWorkerRequest = {
        payload: {
          ...workerFetchParameters(),
          lane: lane.name,
          latencyDebug: isMcapLatencyDebugEnabled(),
        },
        type: "init",
      };
      worker.postMessage(initRequest);
    } catch (error) {
      if (lane.worker === worker) {
        this.resetLane(
          lane,
          mcapErrorMessage(error, "MCAP worker startup failed"),
        );
      } else {
        disposeWorker(worker);
      }
      throw mcapError(error);
    }

    return lane.worker;
  }

  private createWorker(): Worker {
    if (this.options.workerFactory) {
      return this.options.workerFactory();
    }

    return new Worker(new URL("./playback-worker.ts", import.meta.url), {
      type: "module",
    });
  }

  private resetWorkers(reason: string) {
    this.resetLane(this.foregroundLane, reason);
    this.resetLane(this.idleLane, reason);
  }

  private resetLane(lane: WorkerLane, reason: string) {
    const worker = lane.worker;
    lane.worker = undefined;

    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      try {
        const disposeRequest: McapPlaybackWorkerRequest = {
          type: "dispose",
        };
        worker.postMessage(disposeRequest);
      } catch {
        // The worker may already be gone.
      }
      worker.terminate();
    }

    lane.transport.rejectAll(reason);
  }
}

function resourcePriorityToWorkerPriority(
  priority: McapResourceReadOptions["priority"],
): McapPlaybackWorkerPriority | undefined {
  switch (priority) {
    case "current":
      return MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME;
    case "idle":
      return MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH;
    case "playback":
      return MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH;
    case undefined:
      return undefined;
  }
}

function disposeWorker(worker: Worker | undefined) {
  if (!worker) {
    return;
  }

  worker.onmessage = null;
  worker.onerror = null;
  worker.terminate();
}
