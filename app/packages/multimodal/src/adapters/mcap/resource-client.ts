import { createInlineMcapResourceClient } from "./resources";
import type { McapResourceClient } from "./types";
import { createWorkerMcapResourceClient } from "./worker";

/**
 * Options for constructing an MCAP resource client.
 */
export interface CreateMcapResourceClientOptions {
  /**
   * Run MCAP resource reads in a playback worker instead of the calling thread.
   */
  readonly worker?: boolean;
}

/**
 * Creates an MCAP resource client. Calls are inline by default and worker-backed
 * when requested.
 */
export function createMcapResourceClient(
  options: CreateMcapResourceClientOptions = {},
): McapResourceClient {
  if (options.worker === true) {
    return createWorkerMcapResourceClient();
  }

  return createInlineMcapResourceClient();
}
