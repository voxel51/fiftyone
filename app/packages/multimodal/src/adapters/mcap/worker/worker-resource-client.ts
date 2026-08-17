import { getFetchParameters, mergeHeaders } from "@fiftyone/utilities";
import { createMultimodalQueryClient } from "../../../query";
import type { ByteFillSlotClass, ByteReadDebugLog } from "../../../query/bytes";
import type { DecodedOutputCache } from "../../../query/decoding";
import {
  createDecodeClient,
  inlineDecodeExecutor,
} from "../../../query/decoding";
import { createMcapDecoderRegistry } from "../message-decoders/index";
import { createInlineMcapResourceClient } from "../resource-client/inline-client";
import type { McapIndexedMessageReuse } from "../resource-client/operations/read-synchronized-message-batch";
import type {
  McapReadSynchronizedMessageBatchRequest,
  McapReadSynchronizedMessagesRequest,
  McapResourceClient,
  McapSynchronizedMessagesReadOptions,
} from "../contracts/index";
import type {
  McapPlaybackWorkerFetchParameters,
  McapPlaybackWorkerSynchronizedWindow,
  McapRetainedDecodedMessageReference,
} from "./playback-worker-types";

type McapPlaybackWorkerSynchronizedMessagesReadOptions = Omit<
  McapSynchronizedMessagesReadOptions,
  "onTopicSettlement"
> & {
  readonly onTopicSettlement?: (settlement: {
    readonly topic: string;
    readonly window: McapPlaybackWorkerSynchronizedWindow;
  }) => void;
};

export type McapPlaybackWorkerResourceClient = Omit<
  McapResourceClient,
  "readSynchronizedMessageBatch" | "readSynchronizedMessages"
> & {
  readSynchronizedMessageBatch(
    request: McapReadSynchronizedMessageBatchRequest,
  ): Promise<readonly McapPlaybackWorkerSynchronizedWindow[]>;
  readSynchronizedMessages(
    request: McapReadSynchronizedMessagesRequest,
    options?: McapPlaybackWorkerSynchronizedMessagesReadOptions,
  ): Promise<McapPlaybackWorkerSynchronizedWindow>;
};

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
  readonly fillSlotClass?: ByteFillSlotClass;
  readonly onByteRead?: (entry: ByteReadDebugLog) => void;
  readonly readSignal?: { readonly current: AbortSignal | null };
  readonly retainedDecodedRecordIds?: {
    readonly current: ReadonlySet<string> | null;
  };
}

/**
 * Creates an inline MCAP resource client for code running inside a worker.
 */
export function createWorkerResourceClient(
  options: CreateWorkerResourceClientOptions & {
    readonly retainedDecodedRecordIds: {
      readonly current: ReadonlySet<string> | null;
    };
  },
): McapPlaybackWorkerResourceClient;
export function createWorkerResourceClient(
  options?: CreateWorkerResourceClientOptions,
): McapResourceClient;
export function createWorkerResourceClient({
  fillSlotClass,
  onByteRead,
  readSignal,
  retainedDecodedRecordIds,
}: CreateWorkerResourceClientOptions = {}): McapPlaybackWorkerResourceClient {
  const query = createMultimodalQueryClient({
    caches: {
      bytes: {
        ...(fillSlotClass ? { fillSlotClass } : {}),
        onRead: onByteRead,
      },
    },
  });

  const client = createInlineMcapResourceClient({
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
  const reuseRetainedDecodedMessage = retainedDecodedMessageReuse(
    retainedDecodedRecordIds,
  );

  return {
    ...client,
    readSynchronizedMessageBatch: (request) =>
      client.readSynchronizedMessageBatchWithReuse(
        request,
        reuseRetainedDecodedMessage,
      ),
    readSynchronizedMessages: (request, options) => {
      return client.readSynchronizedMessagesWithReuse(
        request,
        reuseRetainedDecodedMessage,
        options?.onTopicSettlement,
        options,
      );
    },
  };
}

function retainedDecodedMessageReuse(
  retainedDecodedRecordIds:
    | { readonly current: ReadonlySet<string> | null }
    | undefined,
): McapIndexedMessageReuse<McapRetainedDecodedMessageReference> {
  return ({ recordId, timelineTimeNs, topic }) => {
    if (!retainedDecodedRecordIds?.current?.has(recordId)) {
      return undefined;
    }
    return {
      kind: "retained-decoded-message",
      recordId,
      timelineTimeNs,
      topic,
    };
  };
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
