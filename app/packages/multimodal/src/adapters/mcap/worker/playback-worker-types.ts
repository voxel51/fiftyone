import type { McapFrameTransformSetWire } from "../frame-transform-types";
import type {
  McapDecodedMessage,
  McapReadDecodedMessagesRequest,
  McapReadFrameTransformBootstrapRequest,
  McapReadFrameTransformWindowRequest,
  McapReadSynchronizedMessageBatchRequest,
  McapReadSynchronizedMessagesRequest,
  McapReadTopicsRequest,
  McapReadTopicTimeBoundsRequest,
  McapReadTimelineRangeRequest,
  McapSynchronizedMessageWindow,
  McapTimelineRange,
  McapTopicTimeBounds,
} from "../types";
import type { StreamInventory } from "../../../schemas/v1";

/**
 * Priority levels used by the MCAP playback worker scheduler.
 */
export const MCAP_PLAYBACK_WORKER_PRIORITY = Object.freeze({
  /**
   * Work needed to render the frame at the active playback time.
   */
  CURRENT_FRAME: 0,
  /**
   * Work needed to keep playback batches ready around the active time window.
   */
  PLAYBACK_BATCH: 1,
  /**
   * Opportunistic background work that can wait behind interactive playback.
   */
  IDLE_PREFETCH: 2,
} as const);

/**
 * Union of playback-worker priority values.
 */
export type McapPlaybackWorkerPriority =
  (typeof MCAP_PLAYBACK_WORKER_PRIORITY)[keyof typeof MCAP_PLAYBACK_WORKER_PRIORITY];

/**
 * Fetch configuration copied from the main thread into the worker.
 */
export type McapPlaybackWorkerFetchParameters = {
  readonly headers: Record<string, string>;
  readonly origin: string;
  readonly pathPrefix: string;
};

/**
 * Typed request payloads supported by the MCAP playback worker RPC surface.
 */
export type McapPlaybackWorkerRequestPayloadByType = {
  readonly readDecodedMessages: McapReadDecodedMessagesRequest;
  readonly readFrameTransformBootstrap: McapReadFrameTransformBootstrapRequest;
  readonly readFrameTransformWindow: McapReadFrameTransformWindowRequest;
  readonly readSynchronizedMessageBatch: McapReadSynchronizedMessageBatchRequest;
  readonly readSynchronizedMessages: McapReadSynchronizedMessagesRequest;
  readonly readTimelineRange: McapReadTimelineRangeRequest;
  readonly readTopics: McapReadTopicsRequest;
  readonly readTopicTimeBounds: McapReadTopicTimeBoundsRequest;
};

/**
 * Unary result payloads returned by worker RPC calls.
 */
export type McapPlaybackWorkerResultByType = {
  readonly readFrameTransformBootstrap: McapFrameTransformSetWire;
  readonly readFrameTransformWindow: McapFrameTransformSetWire;
  readonly readSynchronizedMessageBatch: readonly McapSynchronizedMessageWindow[];
  readonly readSynchronizedMessages: McapSynchronizedMessageWindow;
  readonly readTimelineRange: McapTimelineRange;
  readonly readTopics: readonly StreamInventory[];
  readonly readTopicTimeBounds: readonly McapTopicTimeBounds[];
};

/**
 * Streaming item payloads emitted by worker RPC calls.
 */
export type McapPlaybackWorkerStreamItemByType = {
  readonly readDecodedMessages: McapDecodedMessage;
};

/**
 * Names of all worker RPC operations.
 */
export type McapPlaybackWorkerRpcType =
  keyof McapPlaybackWorkerRequestPayloadByType;

/**
 * Worker RPC operation names that resolve with one final result.
 */
export type McapPlaybackWorkerUnaryType = keyof McapPlaybackWorkerResultByType;

/**
 * Worker RPC operation names that stream multiple result items.
 */
export type McapPlaybackWorkerStreamType =
  keyof McapPlaybackWorkerStreamItemByType;

/**
 * Envelope sent from the main thread for one scheduled worker RPC call.
 */
export type McapPlaybackWorkerRpcRequest<
  Type extends McapPlaybackWorkerRpcType = McapPlaybackWorkerRpcType,
> = Type extends McapPlaybackWorkerRpcType
  ? {
      readonly id: number;
      readonly payload: McapPlaybackWorkerRequestPayloadByType[Type];
      readonly priority: McapPlaybackWorkerPriority;
      readonly sourceKey: string;
      readonly type: Type;
    }
  : never;

/**
 * Lifecycle and cancellation messages handled outside the scheduled RPC queue.
 */
export type McapPlaybackWorkerControlRequest =
  | {
      readonly payload: McapPlaybackWorkerFetchParameters;
      readonly type: "init";
    }
  | {
      readonly id: number;
      readonly type: "cancel";
    }
  | {
      readonly type: "dispose";
    };

/**
 * Any message accepted by the MCAP playback worker.
 */
export type McapPlaybackWorkerRequest =
  | McapPlaybackWorkerControlRequest
  | McapPlaybackWorkerRpcRequest;

/**
 * Final success response for one unary worker RPC.
 */
export type McapPlaybackWorkerUnaryResponse = {
  readonly id: number;
  readonly ok: true;
  readonly result: McapPlaybackWorkerResultByType[McapPlaybackWorkerUnaryType];
};

/**
 * Incremental or terminal success response for one streaming worker RPC.
 */
export type McapPlaybackWorkerStreamResponse =
  | {
      readonly done: false;
      readonly id: number;
      readonly item: McapPlaybackWorkerStreamItemByType[McapPlaybackWorkerStreamType];
      readonly ok: true;
      readonly stream: true;
    }
  | {
      readonly done: true;
      readonly id: number;
      readonly ok: true;
      readonly stream: true;
    };

/**
 * Failure response for any worker RPC.
 */
export type McapPlaybackWorkerErrorResponse = {
  readonly error: string;
  readonly id: number;
  readonly ok: false;
};

/**
 * Response envelope posted by the worker for RPC success, streamed items, or failure.
 */
export type McapPlaybackWorkerResponse =
  | McapPlaybackWorkerUnaryResponse
  | McapPlaybackWorkerStreamResponse
  | McapPlaybackWorkerErrorResponse;
