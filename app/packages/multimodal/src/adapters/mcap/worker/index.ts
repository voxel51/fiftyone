/**
 * Worker-backed MCAP resource client facade.
 */
export { createWorkerMcapResourceClient } from "./worker-client";

/**
 * Options for creating a worker-backed MCAP resource client.
 */
export type { CreateWorkerMcapResourceClientOptions } from "./worker-client";

/**
 * Shared bounded worker pool for MCAP grid previews.
 */
export {
  getMcapGridPreviewPool,
  resetMcapGridPreviewPoolForTests,
} from "./grid-preview-pool";
export type {
  CreateMcapGridPreviewPoolOptions,
  McapGridPreviewPoolRequestOptions,
} from "./grid-preview-pool";
