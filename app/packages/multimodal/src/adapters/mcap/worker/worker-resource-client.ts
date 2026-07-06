import { getFetchParameters, mergeHeaders } from "@fiftyone/utilities";
import { createMultimodalQueryClient } from "../../../query";
import type { DecodedOutputCache } from "../../../query/decode";
import {
  createDecodeClient,
  inlineDecodeExecutor,
} from "../../../query/decode";
import { createMcapDecoderRegistry } from "../decoders";
import { createInlineMcapResourceClient } from "../resources";
import type { McapResourceClient } from "../types";
import type { McapPlaybackWorkerFetchParameters } from "./playback-worker-types";

const transferSafeNoopDecodedOutputCache: DecodedOutputCache = {
  // A declared-noop cache lets decode callers skip building cache identity
  // entirely — record-id hashing walks every payload byte, and the ledger
  // measured it costing more worker CPU than schema decode itself.
  enabled: false,
  clear() {
    return Promise.resolve();
  },
  get() {
    return Promise.resolve(undefined);
  },
  put() {
    return Promise.resolve();
  },
};

export interface CreateWorkerResourceClientOptions {
  readonly readSignal?: { readonly current: AbortSignal | null };
}

/**
 * Creates an inline MCAP resource client for code running inside a worker.
 */
export function createWorkerResourceClient({
  readSignal,
}: CreateWorkerResourceClientOptions = {}): McapResourceClient {
  const query = createMultimodalQueryClient({
    caches: { bytes: {} },
  });

  return createInlineMcapResourceClient({
    byteClient: query.bytes,
    readSignal,
    decodeClient: createDecodeClient({
      // Decoded visualization buffers are transferred to the UI thread.
      // Reusing worker-cached decoded results would either return detached
      // buffers or force extra clones, so playback-window reuse belongs on
      // the main thread.
      cache: transferSafeNoopDecodedOutputCache,
      executor: inlineDecodeExecutor,
      registry: createMcapDecoderRegistry(),
    }),
  });
}

/**
 * Copies the app fetch configuration into worker init messages.
 */
export function workerFetchParameters(): McapPlaybackWorkerFetchParameters {
  const { headers, origin, pathPrefix } = getFetchParameters();

  return {
    headers: mergeHeaders(headers),
    origin,
    pathPrefix,
  };
}
