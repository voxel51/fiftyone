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
  type McapReaderFactory,
} from "../reader/index";
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
import { readMcapRawMessageRecord } from "./operations/read-raw-message-record";
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
  type McapPointCloudChannelResult,
  type McapReadNumericSeriesRequest,
  type McapReadNumericSeriesSliceRequest,
  type McapReadRawMessageRecordRequest,
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
    ): AsyncGenerator<McapDecodedMessage, void, void> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      yield* readMcapDecodedMessages({
        decodeClient,
        readSignal: options.readSignal,
        reader,
        request,
        timeline,
      });
    },

    async readBoundedMessages(
      request: McapReadBoundedMessagesRequest,
      readOptions?: McapResourceReadOptions,
    ): Promise<McapReadBoundedMessagesResult> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      return readMcapBoundedMessages({
        decodeClient,
        reader,
        request,
        signal: readOptions?.signal ?? options.readSignal?.current ?? undefined,
        timeline,
      });
    },

    async readTimelineRange(
      request: McapReadTimelineRangeRequest,
    ): Promise<McapTimelineRange> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      return mcapTimelineRangeFromReader(reader, timeline);
    },

    async readTopics(request: McapReadTopicsRequest) {
      const sourceKey = byteSourceAccessKey(request.source);
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
    ): Promise<McapNumericSeriesResult> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      return readMcapNumericSeries({ reader, request, timeline });
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
    ): Promise<McapRawMessageRecordResult> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      return readMcapRawMessageRecord({ reader, request, timeline });
    },

    async readPointCloudChannel(
      request: McapReadPointCloudChannelRequest,
    ): Promise<McapPointCloudChannelResult> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      return readMcapPointCloudChannel({
        decoderRegistry,
        reader,
        readSignal: options.readSignal,
        request,
        timeline,
      });
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
    ): Promise<McapFrameTransformSet> {
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
    ): Promise<McapFrameTransformSet> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const sourceKey = byteSourceAccessKey(request.source);
      const requiredChildrenKey = [
        ...(request.requiredDynamicChildFrameIds ?? []),
      ]
        .sort()
        .join("\0");
      const windowKey = `${sourceKey}\0${timeline.id}\0${request.startTimeNs}\0${request.endTimeNs}\0${requiredChildrenKey}`;
      return memoizedRead<McapFrameTransformSet>(
        frameTransformWindowReads,
        windowKey,
        () =>
          readerStore.get(request.source).then((reader) =>
            readMcapFrameTransformWindow({
              predecessorStore: predecessorStoreForSource(sourceKey),
              reader,
              readSignal: options.readSignal,
              request,
              timeline,
            }),
          ),
      );
    },

    async readSynchronizedMessageBatch(
      request: McapReadSynchronizedMessageBatchRequest,
    ): Promise<readonly McapSynchronizedMessageWindow[]> {
      return client.readSynchronizedMessageBatchWithReuse(request);
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
    ): Promise<McapSynchronizedMessageWindow> {
      return client.readSynchronizedMessagesWithReuse(request);
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
