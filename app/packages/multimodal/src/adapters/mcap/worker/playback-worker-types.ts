import type { McapFrameTransformSetWire } from "../transforms/types";
import type { McapTransportSnapshot } from "./transport-meter";
import type {
  McapDecodedMessage,
  McapEnumerateNumericFieldsRequest,
  McapNumericSeriesResult,
  McapNumericSeriesSliceResult,
  McapPointCloudChannelResult,
  McapRawMessageRecordResult,
  McapReadBoundedMessagesRequest,
  McapReadBoundedMessagesResult,
  McapReadDecodedMessagesRequest,
  McapReadFrameTransformBootstrapRequest,
  McapReadFrameTransformWindowRequest,
  McapReadNumericSeriesRequest,
  McapReadNumericSeriesSliceRequest,
  McapReadPointCloudChannelRequest,
  McapReadRawMessageRecordRequest,
  McapReadSynchronizedMessageBatchRequest,
  McapReadSynchronizedMessagesRequest,
  McapReadTopicsRequest,
  McapReadTopicTimeBoundsRequest,
  McapReadTimelineRangeRequest,
  McapTimelineRange,
  McapTopicNumericFields,
  McapTopicTimeBounds,
} from "../contracts/index";
import type { McapBoundedReadCancellation } from "../reader";
import type { StreamInventory } from "../../../schemas/v1";
import type { McapSynchronizedMessageWindowWithMessages } from "../resource-client/operations/read-synchronized-message-batch";

/**
 * Priority levels used by the MCAP playback worker scheduler.
 */
export const MCAP_PLAYBACK_WORKER_PRIORITY = Object.freeze({
  /**
   * Work needed to render the frame at the active playback time.
   */
  CURRENT_FRAME: 0,
  /**
   * Work needed to place already-selected current-frame data into the 3D scene.
   * This almost always has to do with transforms.
   *
   * Placement reads are latency-sensitive because late transforms can make
   * point clouds appear in the wrong frame, but they should not jump ahead of
   * the current-frame payloads that first make a tile renderable.
   */
  PLACEMENT_FRAME: 1,
  /**
   * Work needed to keep playback batches ready around the active time window.
   */
  PLAYBACK_BATCH: 2,
  /**
   * Opportunistic background work that can wait behind interactive playback.
   */
  IDLE_PREFETCH: 3,
  /**
   * Bulk history reads for optional context, such as full pose trajectories.
   * These should not serialize playback or placement work on the same queue.
   */
  BULK_HISTORY: 4,
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
  /**
   * Fill-slot class for this worker's remote block fills: interactive and
   * foreground playback lanes declare "priority" (reserved slot access);
   * idle and bulk lanes declare "background".
   */
  readonly fillSlotClass?: "background" | "priority";
  readonly headers: Record<string, string>;
  readonly origin: string;
  readonly pathPrefix: string;
};

/**
 * Typed request payloads supported by the MCAP playback worker RPC surface.
 */
export type McapPlaybackWorkerRequestPayloadByType = {
  readonly enumerateNumericFields: McapEnumerateNumericFieldsRequest;
  readonly readBoundedMessages: McapReadBoundedMessagesRequest;
  readonly readDecodedMessages: McapReadDecodedMessagesRequest;
  readonly readFrameTransformBootstrap: McapReadFrameTransformBootstrapRequest;
  readonly readFrameTransformWindow: McapReadFrameTransformWindowRequest;
  readonly readNumericSeries: McapReadNumericSeriesRequest;
  readonly readNumericSeriesSlice: McapReadNumericSeriesSliceRequest;
  readonly readPointCloudChannel: McapReadPointCloudChannelRequest;
  readonly readRawMessageRecord: McapReadRawMessageRecordRequest;
  readonly readSynchronizedMessageBatch: McapReadSynchronizedMessageBatchRequest;
  readonly readSynchronizedMessages: McapReadSynchronizedMessagesRequest;
  readonly readTimelineRange: McapReadTimelineRangeRequest;
  readonly readTopics: McapReadTopicsRequest;
  readonly readTopicTimeBounds: McapReadTopicTimeBoundsRequest;
};

/** A decoded record that the requesting main thread has pinned for this RPC. */
export interface McapRetainedDecodedMessageReference {
  readonly kind: "retained-decoded-message";
  readonly recordId: string;
  readonly timelineTimeNs: bigint;
  readonly topic: string;
}

export type McapPlaybackWorkerSynchronizedMessage =
  | McapDecodedMessage
  | McapRetainedDecodedMessageReference;

export type McapPlaybackWorkerSynchronizedWindow =
  McapSynchronizedMessageWindowWithMessages<McapPlaybackWorkerSynchronizedMessage>;

/**
 * Unary result payloads returned by worker RPC calls.
 */
export type McapPlaybackWorkerResultByType = {
  readonly enumerateNumericFields: readonly McapTopicNumericFields[];
  readonly readBoundedMessages: McapReadBoundedMessagesResult;
  readonly readFrameTransformBootstrap: McapFrameTransformSetWire;
  readonly readFrameTransformWindow: McapFrameTransformSetWire;
  readonly readNumericSeries: McapNumericSeriesResult;
  readonly readNumericSeriesSlice: McapNumericSeriesSliceResult;
  readonly readPointCloudChannel: McapPointCloudChannelResult;
  readonly readRawMessageRecord: McapRawMessageRecordResult;
  readonly readSynchronizedMessageBatch: readonly McapPlaybackWorkerSynchronizedWindow[];
  readonly readSynchronizedMessages: McapPlaybackWorkerSynchronizedWindow;
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
      /** Exact records pinned by the main thread until this request settles. */
      readonly retainedDecodedRecordIds?: readonly string[];
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
  readonly transport?: McapTransportSnapshot;
};

/**
 * Incremental or terminal success response for one streaming worker RPC.
 */
export type McapPlaybackWorkerStreamResponse =
  | {
      readonly done: false;
      readonly id: number;
      /** One item carrying buffers whose ownership transfers to the client. */
      readonly item: McapPlaybackWorkerStreamItemByType[McapPlaybackWorkerStreamType];
      readonly ok: true;
      readonly stream: true;
    }
  | {
      readonly done: false;
      readonly id: number;
      /** Plain decoded items batched to amortize worker message delivery. */
      readonly items: readonly McapPlaybackWorkerStreamItemByType[McapPlaybackWorkerStreamType][];
      readonly ok: true;
      readonly stream: true;
    }
  | {
      readonly done: true;
      readonly id: number;
      readonly ok: true;
      readonly stream: true;
      readonly transport?: McapTransportSnapshot;
    };

/**
 * Failure response for any worker RPC.
 */
export type McapPlaybackWorkerErrorResponse = {
  readonly boundedReadCancellation?: McapBoundedReadCancellation;
  readonly error: string;
  readonly id: number;
  readonly ok: false;
  readonly transport?: McapTransportSnapshot;
};

/**
 * Progress-only transport counters. These messages do not settle an RPC; they
 * let the UI attribute buffering while a long worker request is still running.
 */
export type McapPlaybackWorkerTransportResponse = {
  readonly ok: true;
  readonly transport: McapTransportSnapshot;
  readonly type: "transport";
};

/**
 * Response envelope posted by the worker for RPC success, streamed items, or failure.
 */
export type McapPlaybackWorkerResponse =
  | McapPlaybackWorkerUnaryResponse
  | McapPlaybackWorkerStreamResponse
  | McapPlaybackWorkerErrorResponse
  | McapPlaybackWorkerTransportResponse;
