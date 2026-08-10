/** Format-neutral MCAP adapter and lazy registration descriptor. */
export { createMcapFormatAdapter } from "./format-adapter";
export type { CreateMcapFormatAdapterOptions } from "./format-adapter";
export { detectMcapSample, mcapAdapterDescriptor } from "./descriptor";

/**
 * Public MCAP resource client factory.
 */
export { createMcapResourceClient } from "./resource-client-factory";

/** Shared MCAP stream classification helpers. */
export {
  hasPayload,
  isCompressedImageStream,
  isImageAnnotationsStream,
  isImageStream,
  isPointCloudStream,
  isSceneUpdateStream,
  streamTopics,
  topicName,
} from "./resource-client/stream-topics";
export type { McapPreviewTopics } from "./resource-client/stream-topics";

/**
 * Default tolerance for synchronized MCAP playback windows.
 */
export { DEFAULT_MCAP_SYNC_TOLERANCE_NS } from "./synchronization/policy";

/** Versioned, diagnosis-only render-cost observability types. */
export type {
  FiftyOneMcapCostBridgeV1,
  McapCostEventV1,
  McapCostSnapshotV1,
  McapCostSourceV1,
} from "./instrumentation/host/mcap-cost-debug";

/**
 * MCAP timeline constants used by playback clocks.
 */
export { MCAP_ACTIVE_TIMELINE } from "./contracts/index";

/**
 * Options for constructing an MCAP resource client.
 */
export type { CreateMcapResourceClientOptions } from "./resource-client-factory";

/**
 * Reader contracts exposed for tests and advanced adapter wiring.
 */
export type { McapIndexedReaderLike, McapReaderFactory } from "./reader";

/**
 * Public MCAP resource, playback, and sync policy contracts.
 */
export type {
  McapDecodedMessage,
  McapReadDecodedMessagesRequest,
  McapReadFrameTransformBootstrapRequest,
  McapReadFrameTransformWindowRequest,
  McapReadSynchronizedMessageBatchRequest,
  McapReadSynchronizedMessagesRequest,
  McapReadTopicsRequest,
  McapReadTimelineRangeRequest,
  McapResolvedStreamSyncPolicy,
  McapResourceClient,
  McapStreamSyncPolicies,
  McapStreamSyncPolicy,
  McapSynchronizedMessageWindow,
  McapTimelineRange,
  McapActiveTimeline,
} from "./contracts/index";

/**
 * Worker-backed MCAP resource client facade.
 */
export { createWorkerMcapResourceClient } from "./worker-host";

/**
 * Options for creating a worker-backed MCAP resource client.
 */
export type { CreateWorkerMcapResourceClientOptions } from "./worker-host";
