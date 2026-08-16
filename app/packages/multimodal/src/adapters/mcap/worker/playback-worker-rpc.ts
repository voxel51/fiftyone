import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerPriority,
  type McapPlaybackWorkerRpcRequest,
  type McapPlaybackWorkerResultByType,
  type McapPlaybackWorkerRpcType,
  type McapPlaybackWorkerStreamItemByType,
  type McapPlaybackWorkerStreamType,
  type McapPlaybackWorkerUnaryType,
} from "./playback-worker-types";
import { dehydrateMcapFrameTransformSet } from "../transforms/wire";
import type { McapResourceClient } from "../contracts/index";
import type { McapPlaybackWorkerResourceClient } from "./worker-resource-client";

/**
 * Worker operation descriptor for one unary MCAP RPC.
 */
export type McapPlaybackWorkerUnaryOperation = {
  readonly kind: "unary";
  readonly priority: McapPlaybackWorkerPriority;
};

/**
 * Worker operation descriptor for one streaming MCAP RPC.
 */
export type McapPlaybackWorkerStreamOperation = {
  readonly kind: "stream";
  readonly priority: McapPlaybackWorkerPriority;
};

/**
 * Union of worker operation descriptors keyed by RPC type.
 */
export type McapPlaybackWorkerOperation =
  | McapPlaybackWorkerUnaryOperation
  | McapPlaybackWorkerStreamOperation;

type McapPlaybackWorkerOperationMap = {
  readonly [Type in McapPlaybackWorkerRpcType]: McapPlaybackWorkerOperation;
};

/**
 * Single source of truth for MCAP worker dispatch and scheduling priority.
 */
export const MCAP_PLAYBACK_WORKER_OPERATIONS: McapPlaybackWorkerOperationMap = {
  enumerateNumericFields: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
  },
  readBoundedMessages: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.BULK_HISTORY,
  },
  readDecodedMessages: {
    kind: "stream",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
  },
  readFrameTransformBootstrap: {
    kind: "unary",
    // Static graph enrichment must not occupy the serial foreground lane in
    // front of image playback batches. Current-time placement remains at
    // PLACEMENT_FRAME through readFrameTransformWindow.
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
  },
  readFrameTransformWindow: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLACEMENT_FRAME,
  },
  readNumericSeries: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.BULK_HISTORY,
  },
  readNumericSeriesSlice: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.BULK_HISTORY,
  },
  readPointCloudChannel: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
  },
  // Explicit Browse actions stay on the interactive lane and bypass the
  // starved-link/idle demand gate used by Follow mode.
  readMessageIndexWindow: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
  },
  readRawMessageAtCursor: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
  },
  // Idle by default: active-playback inspection must not occupy a user-visible
  // playback lane. Explicit paused inspection can opt into its own isolated
  // background-admission worker; whole-message export is explicitly bulk.
  readRawMessageRecord: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
  },
  readSynchronizedMessageBatch: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH,
  },
  readSynchronizedMessages: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
  },
  readTimelineRange: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
  },
  readTransformTopology: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.BULK_HISTORY,
  },
  readTopics: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
  },
  readTopicTimeBounds: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
  },
};

/**
 * Returns the worker operation descriptor for one RPC type.
 */
export function mcapPlaybackWorkerOperation(
  type: McapPlaybackWorkerRpcType,
): McapPlaybackWorkerOperation {
  return MCAP_PLAYBACK_WORKER_OPERATIONS[type];
}

/**
 * Narrows a scheduled worker request to the streaming operation family.
 */
export function isMcapPlaybackWorkerStreamRequest(
  message: McapPlaybackWorkerRpcRequest,
): message is McapPlaybackWorkerRpcRequest<McapPlaybackWorkerStreamType> {
  return mcapPlaybackWorkerOperation(message.type).kind === "stream";
}

/**
 * Runs one unary MCAP worker request against a resource client.
 */
export function runMcapPlaybackWorkerUnaryRequest(
  client: McapPlaybackWorkerResourceClient,
  message: McapPlaybackWorkerRpcRequest<McapPlaybackWorkerUnaryType>,
  onSynchronizedProgress?: (
    window: McapPlaybackWorkerResultByType["readSynchronizedMessages"],
  ) => void,
): Promise<McapPlaybackWorkerResultByType[McapPlaybackWorkerUnaryType]> {
  switch (message.type) {
    case "enumerateNumericFields":
      return client.enumerateNumericFields(message.payload);
    case "readBoundedMessages":
      return client.readBoundedMessages(message.payload);
    case "readFrameTransformBootstrap":
      return client
        .readFrameTransformBootstrap(message.payload)
        .then(dehydrateMcapFrameTransformSet);
    case "readFrameTransformWindow":
      return client
        .readFrameTransformWindow(message.payload)
        .then(dehydrateMcapFrameTransformSet);
    case "readNumericSeries":
      return client.readNumericSeries(message.payload);
    case "readNumericSeriesSlice":
      if (!client.readNumericSeriesSlice) {
        return Promise.reject(
          new Error("Bounded numeric series reads are unavailable"),
        );
      }
      return client.readNumericSeriesSlice(message.payload);
    case "readPointCloudChannel":
      if (!client.readPointCloudChannel) {
        return Promise.reject(
          new Error("Point-cloud channel projection is unavailable"),
        );
      }
      return client.readPointCloudChannel(message.payload);
    case "readRawMessageRecord":
      return client.readRawMessageRecord(message.payload);
    case "readRawMessageAtCursor":
      if (!client.readRawMessageAtCursor) {
        return Promise.reject(
          new Error("Exact MCAP message reads are unavailable"),
        );
      }
      return client.readRawMessageAtCursor(message.payload);
    case "readMessageIndexWindow":
      if (!client.readMessageIndexWindow) {
        return Promise.reject(
          new Error("Exact MCAP message indexes are unavailable"),
        );
      }
      return client.readMessageIndexWindow(message.payload);
    case "readSynchronizedMessageBatch":
      return client.readSynchronizedMessageBatch(message.payload);
    case "readSynchronizedMessages":
      return client.readSynchronizedMessages(
        message.payload,
        onSynchronizedProgress,
      );
    case "readTimelineRange":
      return client.readTimelineRange(message.payload);
    case "readTransformTopology":
      if (!client.readTransformTopology) {
        return Promise.reject(
          new Error("Transform topology reads are unavailable"),
        );
      }
      return client.readTransformTopology(message.payload);
    case "readTopics":
      return client.readTopics(message.payload);
    case "readTopicTimeBounds":
      return client.readTopicTimeBounds(message.payload);
  }
}

/**
 * Streams results for one streaming MCAP worker request.
 */
export async function* runMcapPlaybackWorkerStreamRequest(
  client: Pick<McapResourceClient, "readDecodedMessages">,
  message: McapPlaybackWorkerRpcRequest<McapPlaybackWorkerStreamType>,
): AsyncGenerator<
  McapPlaybackWorkerStreamItemByType[McapPlaybackWorkerStreamType],
  void,
  void
> {
  switch (message.type) {
    case "readDecodedMessages":
      yield* client.readDecodedMessages(message.payload);
      return;
  }
}
