/**
 * Public MCAP resource client factory.
 */
export { createMcapResourceClient } from "./resources";

/**
 * Default tolerance for synchronized MCAP playback windows.
 */
export { DEFAULT_MCAP_SYNC_TOLERANCE_NS } from "./sync";

/**
 * MCAP timestamp source constants used by playback clocks.
 */
export { MCAP_TIMESTAMP_SOURCE } from "./types";

/**
 * Options for constructing an MCAP resource client.
 */
export type { CreateMcapResourceClientOptions } from "./resources";

/**
 * Reader contracts exposed for tests and advanced adapter wiring.
 */
export type {
  McapIndexedReaderLike,
  McapReadable,
  McapReaderFactory,
} from "./reader";

/**
 * Public MCAP resource, playback, and sync policy contracts.
 */
export type {
  McapDecodedMessage,
  McapMessageTime,
  McapReadDecodedMessagesRequest,
  McapReadMessageTimesRequest,
  McapReadSynchronizedMessageBatchRequest,
  McapReadSynchronizedMessagesRequest,
  McapReadTimelineAnchorsRequest,
  McapResolvedStreamSyncPolicy,
  McapResourceClient,
  McapSourceDescriptor,
  McapStreamSyncPolicies,
  McapStreamSyncPolicy,
  McapSynchronizedMessageWindow,
  McapTimestampSource,
} from "./types";

/**
 * Worker-backed MCAP resource client facade.
 */
export { createWorkerMcapResourceClient } from "./worker";

/**
 * Options for creating a worker-backed MCAP resource client.
 */
export type { CreateWorkerMcapResourceClientOptions } from "./worker";
