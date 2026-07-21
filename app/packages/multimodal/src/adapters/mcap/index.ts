/** Format-neutral MCAP adapter and lazy registration descriptor. */
export { createMcapFormatAdapter } from "./format-adapter";
export type { CreateMcapFormatAdapterOptions } from "./format-adapter";
export { detectMcapSample, mcapAdapterDescriptor } from "./descriptor";

/**
 * Public MCAP resource client factory.
 */
export { createMcapResourceClient } from "./resource-client";

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
} from "./resources/stream-topics";
export type { McapPreviewTopics } from "./resources/stream-topics";

/**
 * Default tolerance for synchronized MCAP playback windows.
 */
export { DEFAULT_MCAP_SYNC_TOLERANCE_NS } from "./shared/sync";

/**
 * MCAP timeline constants used by playback clocks.
 */
export { MCAP_ACTIVE_TIMELINE } from "./shared/types";

/**
 * Options for constructing an MCAP resource client.
 */
export type { CreateMcapResourceClientOptions } from "./resource-client";

/**
 * Reader contracts exposed for tests and advanced adapter wiring.
 */
export type { McapIndexedReaderLike, McapReaderFactory } from "./reader";

/**
 * Frame-transform domain types used by 3D renderers.
 */
export type {
  McapComposedFrameTransform,
  McapFrameTransformResolution,
} from "./shared/frame-transform-types";

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
} from "./shared/types";

/**
 * Worker-backed MCAP resource client facade.
 */
export { createWorkerMcapResourceClient } from "./worker";

/**
 * Options for creating a worker-backed MCAP resource client.
 */
export type { CreateWorkerMcapResourceClientOptions } from "./worker";
