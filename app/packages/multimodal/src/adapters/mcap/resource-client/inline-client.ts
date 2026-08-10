import { LRUCache } from "lru-cache";
import {
  byteSourceAccessKey,
  type ByteClient,
} from "../../../query/bytes/index";
import {
  type DecodeClient,
  createDecodeClient,
} from "../../../query/decoding/index";
import { createMultimodalQueryClient } from "../../../query/index";
import { createMcapDecoderRegistry } from "../message-decoders/index";
import { readMcapDecodedMessages } from "./operations/read-decoded-messages";
import { readMcapBoundedMessages } from "./operations/read-bounded-messages";
import {
  createDefaultMcapReader,
  createMcapReaderStore,
  type McapChunkReadDebugLog,
  type McapIndexedReaderLike,
  type McapReaderFactory,
} from "../reader/index";
import { ByteClientReadable } from "../reader/byte-readable";
import { mcapTimelineRangeFromReader } from "./operations/read-timeline-range";
import {
  readMcapSynchronizedMessageBatch,
  type McapIndexedMessageReuse,
  type McapSynchronizedMessageWindowWithMessages,
} from "./operations/read-synchronized-message-batch";
import {
  createMcapPredecessorStore,
  type McapPredecessorStore,
} from "./predecessor-store";
import { resolveMcapTimelineStrategy } from "./timeline";
import {
  readMcapFrameTransformBootstrap,
  readMcapFrameTransformWindow,
} from "./operations/read-frame-transforms";
import { enumerateMcapNumericFields } from "./numeric-fields";
import {
  readMcapNumericSeries,
  readMcapNumericSeriesSlice,
} from "./operations/read-numeric-series";
import {
  RAW_RECORD_MAX_WALL_TIME_MS,
  rawRecordWallTimeError,
  readMcapRawMessageAtCursor,
  readMcapRawMessageRecord,
} from "./operations/read-raw-message-record";
import { readMcapMessageIndexWindow } from "./operations/read-message-index-window";
import { readMcapPointCloudChannel } from "./operations/read-point-cloud-channel";
import { readMcapTopics } from "./operations/read-topics";
import { readMcapTopicTimeBounds } from "./operations/read-topic-time-bounds";
import type { McapFrameTransformSet } from "../transforms/types";
import {
  type McapDecodedMessage,
  type McapEnumerateNumericFieldsRequest,
  type McapNumericSeriesResult,
  type McapNumericSeriesSliceResult,
  type McapReadDecodedMessagesRequest,
  type McapReadBoundedMessagesRequest,
  type McapReadBoundedMessagesResult,
  type McapReadFrameTransformBootstrapRequest,
  type McapReadFrameTransformWindowRequest,
  type McapRawMessageRecordResult,
  type McapMessageIndexWindowResult,
  type McapPointCloudChannelResult,
  type McapReadNumericSeriesRequest,
  type McapReadNumericSeriesSliceRequest,
  type McapReadRawMessageRecordRequest,
  type McapReadRawMessageAtCursorRequest,
  type McapReadMessageIndexWindowRequest,
  type McapReadPointCloudChannelRequest,
  type McapReadSynchronizedMessageBatchRequest,
  type McapReadSynchronizedMessagesRequest,
  type McapReadTopicsRequest,
  type McapReadTopicTimeBoundsRequest,
  type McapReadTimelineRangeRequest,
  type McapResourceClient,
  type McapResourceReadOptions,
  type McapSynchronizedMessageWindow,
  type McapTimelineRange,
  type McapTopicNumericFields,
  type McapTopicTimeBounds,
} from "../contracts/index";
import type { StreamInventory } from "../../../schemas/v1/index";
import { memoizedRead } from "./memoized-read";
import { createAbortError, throwIfAborted } from "../../../utils/cancellation";

const FRAME_TRANSFORM_WINDOW_READ_CACHE_LIMIT = 32;
const MEMOIZED_READ_CACHE_LIMIT = 32;

/**
 * Inline-only options for constructing an MCAP resource client.
 */
export interface CreateInlineMcapResourceClientOptions {
  readonly byteClient?: ByteClient;
  readonly decodeClient?: DecodeClient;
  readonly debugChunkReads?: boolean;
  readonly logChunkRead?: (entry: McapChunkReadDebugLog) => void;
  readonly readerFactory?: McapReaderFactory;
  readonly readSignal?: { readonly current: AbortSignal | null };
}

export interface McapSynchronizedMessageReuseClient extends McapResourceClient {
  readSynchronizedMessageBatchWithReuse<
    ReusedMessage extends {
      readonly timelineTimeNs: bigint;
      readonly topic: string;
    } = never,
  >(
    request: McapReadSynchronizedMessageBatchRequest,
    reuseIndexedMessage?: McapIndexedMessageReuse<ReusedMessage>,
  ): Promise<
    readonly McapSynchronizedMessageWindowWithMessages<
      McapDecodedMessage | ReusedMessage
    >[]
  >;
  readSynchronizedMessagesWithReuse<
    ReusedMessage extends {
      readonly timelineTimeNs: bigint;
      readonly topic: string;
    } = never,
  >(
    request: McapReadSynchronizedMessagesRequest,
    reuseIndexedMessage?: McapIndexedMessageReuse<ReusedMessage>,
  ): Promise<
    McapSynchronizedMessageWindowWithMessages<
      McapDecodedMessage | ReusedMessage
    >
  >;
}

/**
 * Creates an MCAP resource client over the generic byte and decode clients.
 */
export function createInlineMcapResourceClient(
  options: CreateInlineMcapResourceClientOptions = {},
): McapSynchronizedMessageReuseClient {
  const query = createMultimodalQueryClient();
  const byteClient = options.byteClient ?? query.bytes;
  const decoderRegistry = createMcapDecoderRegistry();
  const decodeClient =
    options.decodeClient ??
    createDecodeClient({
      cache: query.caches.decoded,
      registry: decoderRegistry,
    });
  const readerFactory = options.readerFactory ?? createDefaultMcapReader;
  const readerStore = createMcapReaderStore({
    byteClient,
    debugChunkReads: options.debugChunkReads,
    logChunkRead: options.logChunkRead,
    readerFactory,
    readSignal: options.readSignal,
  });
  const memoizedReadCaches: Array<{ clear(): void }> = [];
  const createReadCache = <Value>(max = MEMOIZED_READ_CACHE_LIMIT) => {
    const cache = new LRUCache<string, Promise<Value>>({ max });
    memoizedReadCaches.push(cache);
    return cache;
  };
  const topicReads = createReadCache<readonly StreamInventory[]>();
  const numericFieldReads =
    createReadCache<readonly McapTopicNumericFields[]>();
  const topicTimeBoundsReads =
    createReadCache<readonly McapTopicTimeBounds[]>();
  // Per-source predecessor memos; bounded by topic count, dropped on dispose.
  const predecessorStores = new Map<string, McapPredecessorStore>();
  const frameTransformBootstrapReads = createReadCache<McapFrameTransformSet>();
  const frameTransformWindowReads = createReadCache<McapFrameTransformSet>(
    FRAME_TRANSFORM_WINDOW_READ_CACHE_LIMIT,
  );
  const predecessorStoreForSource = (sourceKey: string) => {
    let store = predecessorStores.get(sourceKey);
    if (!store) {
      store = createMcapPredecessorStore();
      predecessorStores.set(sourceKey, store);
    }
    return store;
  };
  const createRequestReader = (
    source: McapReadTimelineRangeRequest["source"],
    signal: AbortSignal,
  ) =>
    readerFactory(
      source,
      new ByteClientReadable(source, byteClient, {
        debugChunkReads: options.debugChunkReads,
        logChunkRead: options.logChunkRead,
        readSignal: { current: signal },
      }),
    );
  const withRequestReader = async <Value>(
    source: McapReadTimelineRangeRequest["source"],
    signal: AbortSignal | undefined,
    read: (reader: McapIndexedReaderLike) => Promise<Value> | Value,
  ): Promise<Value> => {
    throwIfAborted(signal);
    if (!signal) return read(await readerStore.get(source));
    const reader = await createRequestReader(source, signal);
    try {
      throwIfAborted(signal);
      const value = await read(reader);
      throwIfAborted(signal);
      return value;
    } finally {
      reader.dispose?.();
    }
  };
  // Exact Browse operations keep one source reader so adjacent selections
  // share initialized indexes and the reader-owned decompressed-chunk cache.
  const withCachedReader = async <Value>(
    source: McapReadTimelineRangeRequest["source"],
    signal: AbortSignal,
    read: (reader: McapIndexedReaderLike) => Promise<Value> | Value,
  ): Promise<Value> => {
    throwIfAborted(signal);
    const reader = await waitForValueOrAbort(readerStore.get(source), signal);
    throwIfAborted(signal);
    const value = await read(reader);
    throwIfAborted(signal);
    return value;
  };

  const client: McapSynchronizedMessageReuseClient = {
    dispose() {
      for (const cache of memoizedReadCaches) {
        cache.clear();
      }
      predecessorStores.clear();
      readerStore.dispose();
    },

    async *readDecodedMessages(
      request: McapReadDecodedMessagesRequest,
      readOptions?: McapResourceReadOptions,
    ): AsyncGenerator<McapDecodedMessage, void, void> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const signal = readOptions?.signal;
      throwIfAborted(signal);
      // @mcap/core does not accept a signal on readMessages(). A signalled
      // inline read therefore owns a reader whose byte-readable is scoped to
      // that one request; concurrent reads cannot overwrite each other's
      // cancellation state. Unsigned reads keep the normal shared reader.
      const reader = signal
        ? await createRequestReader(request.source, signal)
        : await readerStore.get(request.source);
      try {
        yield* readMcapDecodedMessages({
          decodeClient,
          readSignal: options.readSignal,
          reader,
          request,
          signal,
          timeline,
        });
      } finally {
        if (signal) reader.dispose?.();
      }
    },

    async readBoundedMessages(
      request: McapReadBoundedMessagesRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<McapReadBoundedMessagesResult> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      return withRequestReader(request.source, readOptions?.signal, (reader) =>
        readMcapBoundedMessages({
          decodeClient,
          reader,
          request,
          signal:
            readOptions?.signal ?? options.readSignal?.current ?? undefined,
          timeline,
        }),
      );
    },

    async readTimelineRange(
      request: McapReadTimelineRangeRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<McapTimelineRange> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      return withRequestReader(request.source, readOptions?.signal, (reader) =>
        mcapTimelineRangeFromReader(reader, timeline),
      );
    },

    async readTopics(
      request: McapReadTopicsRequest,
      readOptions?: McapResourceReadOptions,
    ) {
      const sourceKey = byteSourceAccessKey(request.source);
      if (readOptions?.signal) {
        return withRequestReader(
          request.source,
          readOptions.signal,
          readMcapTopics,
        );
      }
      return memoizedRead<readonly StreamInventory[]>(
        topicReads,
        sourceKey,
        () =>
          readerStore
            .get(request.source)
            .then((reader) => readMcapTopics(reader)),
      );
    },

    async enumerateNumericFields(request: McapEnumerateNumericFieldsRequest) {
      const sourceKey = byteSourceAccessKey(request.source);
      const fallbackKey =
        request.includeDataFallback === false ? "schema" : "bounded";
      const fieldsKey = request.topics
        ? [sourceKey, fallbackKey, ...request.topics].join("\0")
        : [sourceKey, fallbackKey].join("\0");
      return memoizedRead<readonly McapTopicNumericFields[]>(
        numericFieldReads,
        fieldsKey,
        () =>
          readerStore
            .get(request.source)
            .then((reader) => enumerateMcapNumericFields(reader, request)),
      );
    },

    async readNumericSeries(
      request: McapReadNumericSeriesRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<McapNumericSeriesResult> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      return readMcapNumericSeries({
        reader,
        request,
        signal: readOptions?.signal ?? options.readSignal?.current ?? undefined,
        timeline,
      });
    },

    async readNumericSeriesSlice(
      request: McapReadNumericSeriesSliceRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<McapNumericSeriesSliceResult> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      return readMcapNumericSeriesSlice({
        reader,
        request,
        signal: readOptions?.signal ?? options.readSignal?.current ?? undefined,
        timeline,
      });
    },

    async readRawMessageRecord(
      request: McapReadRawMessageRecordRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<McapRawMessageRecordResult> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      return withRawRecordDeadline(
        readOptions?.signal ?? options.readSignal?.current ?? undefined,
        (signal) =>
          withRequestReader(request.source, signal, (reader) =>
            readMcapRawMessageRecord({
              reader,
              request,
              signal,
              timeline,
            }),
          ),
      );
    },

    async readRawMessageAtCursor(
      request: McapReadRawMessageAtCursorRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<McapRawMessageRecordResult> {
      return withRawRecordDeadline(
        readOptions?.signal ?? options.readSignal?.current ?? undefined,
        (signal) =>
          withCachedReader(request.source, signal, (reader) =>
            readMcapRawMessageAtCursor({
              reader,
              request,
              signal,
            }),
          ),
      );
    },

    async readMessageIndexWindow(
      request: McapReadMessageIndexWindowRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<McapMessageIndexWindowResult> {
      return withRawRecordDeadline(
        readOptions?.signal ?? options.readSignal?.current ?? undefined,
        (signal) =>
          withCachedReader(request.source, signal, (reader) =>
            readMcapMessageIndexWindow({
              reader,
              request,
              signal,
            }),
          ),
      );
    },

    async readPointCloudChannel(
      request: McapReadPointCloudChannelRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<McapPointCloudChannelResult> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      return withRequestReader(request.source, readOptions?.signal, (reader) =>
        readMcapPointCloudChannel({
          decoderRegistry,
          reader,
          readSignal: readOptions?.signal
            ? { current: readOptions.signal }
            : options.readSignal,
          request,
          timeline,
        }),
      );
    },

    async readTopicTimeBounds(request: McapReadTopicTimeBoundsRequest) {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const sourceKey = byteSourceAccessKey(request.source);
      const boundsKey = [sourceKey, timeline.id, ...request.topics].join("\0");
      return memoizedRead<readonly McapTopicTimeBounds[]>(
        topicTimeBoundsReads,
        boundsKey,
        () =>
          readerStore
            .get(request.source)
            .then((reader) => readMcapTopicTimeBounds({ reader, request })),
      );
    },

    async readFrameTransformBootstrap(
      request: McapReadFrameTransformBootstrapRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<McapFrameTransformSet> {
      if (readOptions?.signal) {
        return withRequestReader(request.source, readOptions.signal, (reader) =>
          readMcapFrameTransformBootstrap(reader, readOptions.signal),
        );
      }
      const sourceKey = byteSourceAccessKey(request.source);
      return memoizedRead<McapFrameTransformSet>(
        frameTransformBootstrapReads,
        sourceKey,
        () =>
          readerStore
            .get(request.source)
            .then((reader) => readMcapFrameTransformBootstrap(reader)),
      );
    },

    async readFrameTransformWindow(
      request: McapReadFrameTransformWindowRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<McapFrameTransformSet> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const sourceKey = byteSourceAccessKey(request.source);
      const requiredChildrenKey = [
        ...(request.requiredDynamicChildFrameIds ?? []),
      ]
        .sort()
        .join("\0");
      const windowKey = `${sourceKey}\0${timeline.id}\0${request.startTimeNs}\0${request.endTimeNs}\0${requiredChildrenKey}`;
      const readWindow = (reader: McapIndexedReaderLike) =>
        readMcapFrameTransformWindow({
          predecessorStore: predecessorStoreForSource(sourceKey),
          reader,
          readSignal: readOptions?.signal
            ? { current: readOptions.signal }
            : options.readSignal,
          request,
          timeline,
        });
      if (readOptions?.signal) {
        return withRequestReader(
          request.source,
          readOptions.signal,
          readWindow,
        );
      }
      return memoizedRead<McapFrameTransformSet>(
        frameTransformWindowReads,
        windowKey,
        () => readerStore.get(request.source).then(readWindow),
      );
    },

    async readSynchronizedMessageBatch(
      request: McapReadSynchronizedMessageBatchRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<readonly McapSynchronizedMessageWindow[]> {
      if (request.timeNs.length === 0) return [];
      if (!readOptions?.signal) {
        return client.readSynchronizedMessageBatchWithReuse(request);
      }
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const sourceKey = byteSourceAccessKey(request.source);
      return withRequestReader(request.source, readOptions.signal, (reader) =>
        readMcapSynchronizedMessageBatch({
          decodeClient,
          predecessorStore: predecessorStoreForSource(sourceKey),
          reader,
          readSignal: { current: readOptions.signal ?? null },
          request,
          timeline,
        }),
      );
    },

    async readSynchronizedMessageBatchWithReuse(request, reuseIndexedMessage) {
      if (request.timeNs.length === 0) {
        return [];
      }

      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      const sourceKey = byteSourceAccessKey(request.source);

      return readMcapSynchronizedMessageBatch({
        decodeClient,
        predecessorStore: predecessorStoreForSource(sourceKey),
        reader,
        readSignal: options.readSignal,
        request,
        reuseIndexedMessage,
        timeline,
      });
    },

    async readSynchronizedMessages(
      request: McapReadSynchronizedMessagesRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<McapSynchronizedMessageWindow> {
      const windows = await client.readSynchronizedMessageBatch(
        { ...request, timeNs: [request.timeNs] },
        readOptions,
      );
      const window = windows[0];
      if (!window) throw new Error("Expected synchronized MCAP window");
      return window;
    },

    async readSynchronizedMessagesWithReuse(request, reuseIndexedMessage) {
      const windows = await client.readSynchronizedMessageBatchWithReuse(
        { ...request, timeNs: [request.timeNs] },
        reuseIndexedMessage,
      );
      const window = windows[0];
      if (!window) {
        throw new Error("Expected synchronized MCAP window");
      }
      return window;
    },
  };

  return client;
}

function waitForValueOrAbort<Value>(
  value: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> {
  if (signal.aborted) {
    return Promise.reject(
      createAbortError("MCAP cached reader acquisition aborted"),
    );
  }
  return new Promise((resolve, reject) => {
    const finish = (complete: () => void) => {
      signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () =>
      finish(() =>
        reject(createAbortError("MCAP cached reader acquisition aborted")),
      );
    signal.addEventListener("abort", onAbort, { once: true });
    void value.then(
      (result) => finish(() => resolve(result)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

async function withRawRecordDeadline<Value>(
  parentSignal: AbortSignal | undefined,
  read: (signal: AbortSignal) => Promise<Value>,
): Promise<Value> {
  const deadline = createReadDeadline(
    parentSignal,
    RAW_RECORD_MAX_WALL_TIME_MS,
  );
  try {
    return await read(deadline.signal);
  } catch (error) {
    if (deadline.didTimeOut()) throw rawRecordWallTimeError();
    throw error;
  } finally {
    deadline.cleanup();
  }
}

function createReadDeadline(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): {
  cleanup(): void;
  didTimeOut(): boolean;
  readonly signal: AbortSignal;
} {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    cleanup() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
    didTimeOut: () => timedOut,
    signal: controller.signal,
  };
}
