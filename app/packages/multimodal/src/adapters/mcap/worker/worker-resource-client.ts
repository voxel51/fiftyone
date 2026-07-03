import { getFetchParameters, mergeHeaders } from "@fiftyone/utilities";
import { createMultimodalQueryClient } from "../../../query";
import type { ByteReadDebugLog } from "../../../query/bytes";
import type { DecodedOutputCache, DecodeExecutor } from "../../../query/decode";
import {
  createDecodeClient,
  inlineDecodeExecutor,
} from "../../../query/decode";
import {
  isMcapDecodeStageMeterEnabled,
  mcapDecodeStageNowMs,
  recordMcapDecodeStage,
} from "../decode-stage-meter";
import { createMcapDecoderRegistry } from "../decoders";
import { createInlineMcapResourceClient } from "../resources";
import type { McapChunkReadDebugLog } from "../reader";
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

// Reports per-message decode time to the stage meter so the ledger can
// split a request's runMs into fetch-wait vs decode CPU per schema.
const meteredInlineDecodeExecutor: DecodeExecutor = {
  async decode(request) {
    if (!isMcapDecodeStageMeterEnabled()) {
      return inlineDecodeExecutor.decode(request);
    }

    const startMs = mcapDecodeStageNowMs();
    try {
      return await inlineDecodeExecutor.decode(request);
    } finally {
      recordMcapDecodeStage({
        bytes: request.bytes.byteLength,
        label: request.payload.schema ?? request.payload.encoding,
        ms: mcapDecodeStageNowMs() - startMs,
        stage: "decode",
        topic: request.context.streamId,
      });
    }
  },
};

export interface CreateWorkerResourceClientOptions {
  readonly debugByteReads?: boolean;
  readonly debugChunkReads?: boolean;
  readonly logChunkRead?: (entry: McapChunkReadDebugLog) => void;
  readonly onByteRead?: (entry: ByteReadDebugLog) => void;
  readonly readSignal?: { readonly current: AbortSignal | null };
}

/**
 * Creates an inline MCAP resource client for code running inside a worker.
 */
export function createWorkerResourceClient({
  debugByteReads,
  debugChunkReads,
  logChunkRead,
  onByteRead,
  readSignal,
}: CreateWorkerResourceClientOptions = {}): McapResourceClient {
  const query = createMultimodalQueryClient({
    caches: {
      bytes: {
        debug: { enabled: debugByteReads },
        onRead: onByteRead,
      },
    },
  });

  return createInlineMcapResourceClient({
    byteClient: query.bytes,
    debugChunkReads,
    logChunkRead,
    readSignal,
    decodeClient: createDecodeClient({
      // Decoded visualization buffers are transferred to the UI thread.
      // Reusing worker-cached decoded results would either return detached
      // buffers or force extra clones, so playback-window reuse belongs on
      // the main thread.
      cache: transferSafeNoopDecodedOutputCache,
      executor: meteredInlineDecodeExecutor,
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
