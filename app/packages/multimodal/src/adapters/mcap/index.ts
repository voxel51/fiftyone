/**
 * React helpers for MCAP renderer client lifecycle.
 */
export { useMcapFrameTransforms, useMcapResourceClient } from "./react";
export type {
  McapFrameTransformResolver,
  UseMcapResourceClientOptions,
} from "./react";

/**
 * Public MCAP resource client factory.
 */
export { createMcapResourceClient } from "./resource-client";

/**
 * Shared MCAP stream classification and topic matching helpers.
 */
export {
  chooseAnnotationTopic,
  topicPrefix,
  topicTokens,
} from "./topic-matching";
export {
  hasPayload,
  isCompressedImageStream,
  isImageAnnotationsStream,
  isPointCloudStream,
  streamTopics,
  topicName,
} from "./stream-topics";
export type { McapPreviewTopics } from "./stream-topics";

/**
 * Default tolerance for synchronized MCAP playback windows.
 */
export { DEFAULT_MCAP_SYNC_TOLERANCE_NS } from "./sync";

/**
 * MCAP timeline constants used by playback clocks.
 */
export { MCAP_ACTIVE_TIMELINE } from "./types";

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
} from "./frame-transform-types";

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
} from "./types";

/**
 * Worker-backed MCAP resource client facade.
 */
export { createWorkerMcapResourceClient } from "./worker";

/**
 * Options for creating a worker-backed MCAP resource client.
 */
export type { CreateWorkerMcapResourceClientOptions } from "./worker";
