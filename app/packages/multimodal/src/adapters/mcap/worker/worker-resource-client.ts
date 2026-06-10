import { getFetchParameters, mergeHeaders } from "@fiftyone/utilities";
import { createMultimodalQueryClient } from "../../../query";
import type { DecodedOutputCache } from "../../../query/decode";
import { createDecodeClient } from "../../../query/decode";
import { createMcapDecoderRegistry } from "../decoders";
import { createInlineMcapResourceClient } from "../resources";
import type { McapResourceClient } from "../types";
import type { McapPlaybackWorkerFetchParameters } from "./playback-worker-types";

const transferSafeNoopDecodedOutputCache: DecodedOutputCache = {
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

/**
 * Creates an inline MCAP resource client for code running inside a worker.
 */
export function createWorkerResourceClient(): McapResourceClient {
  const query = createMultimodalQueryClient();

  return createInlineMcapResourceClient({
    byteClient: query.bytes,
    decodeClient: createDecodeClient({
      // Decoded visualization buffers are transferred to the UI thread.
      // Reusing worker-cached decoded results would either return detached
      // buffers or force extra clones, so playback-window reuse belongs on
      // the main thread.
      cache: transferSafeNoopDecodedOutputCache,
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
