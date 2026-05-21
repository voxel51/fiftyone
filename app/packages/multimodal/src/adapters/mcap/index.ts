/**
 * React helper for MCAP renderer client lifecycle.
 */
export { useMcapResourceClient } from "./react";
export type { UseMcapResourceClientOptions } from "./react";

/**
 * Public MCAP resource client factory.
 */
export { createMcapResourceClient } from "./resource-client";

/**
 * Default tolerance for synchronized MCAP playback windows.
 */
export { DEFAULT_MCAP_SYNC_TOLERANCE_NS } from "./sync";

/**
 * Static frame graph helpers used by 3D MCAP renderers.
 */
export {
  createMcapStaticTransformGraph,
  resolveMcapStaticFrameTransform,
  selectMcapFixedFrame,
} from "./frame-graph";

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
 * Public MCAP resource, playback, and sync policy contracts.
 */
export type {
  McapComposedFrameTransform,
  McapDecodedMessage,
  McapReadDecodedMessagesRequest,
  McapReadStaticTransformsRequest,
  McapReadSynchronizedMessageBatchRequest,
  McapReadSynchronizedMessagesRequest,
  McapReadTopicsRequest,
  McapReadTimelineRangeRequest,
  McapResolvedStreamSyncPolicy,
  McapResourceClient,
  McapQuaternion,
  McapStaticTransform,
  McapStaticTransformGraph,
  McapStreamSyncPolicies,
  McapStreamSyncPolicy,
  McapSynchronizedMessageWindow,
  McapTimelineRange,
  McapVector3,
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
