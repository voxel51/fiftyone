import {
  createInlineMcapResourceClient,
  type CreateInlineMcapResourceClientOptions,
} from "./resources";
import type { McapResourceClient } from "./types";
import { createWorkerMcapResourceClient } from "./worker";

/**
 * Options for constructing an MCAP resource client.
 */
export type CreateMcapResourceClientOptions =
  | (CreateInlineMcapResourceClientOptions & {
      /**
       * Run MCAP resource reads on the calling thread.
       */
      readonly worker?: false;
    })
  | {
      /**
       * Run MCAP resource reads in a playback worker instead of the calling
       * thread.
       */
      readonly worker: true;
    };

/**
 * Creates an MCAP resource client. Calls are inline by default and worker-backed
 * when requested.
 */
export function createMcapResourceClient(
  options: CreateMcapResourceClientOptions = {}
): McapResourceClient {
  if (options.worker === true) {
    return createWorkerMcapResourceClient();
  }

  const { worker: _worker, ...inlineOptions } = options;
  return createInlineMcapResourceClient(inlineOptions);
}
