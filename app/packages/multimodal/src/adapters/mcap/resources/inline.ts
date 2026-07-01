import { LRUCache } from "lru-cache";
import { byteSourceAccessKey, type ByteClient } from "../../../query/bytes";
import { type DecodeClient, createDecodeClient } from "../../../query/decode";
import { createMultimodalQueryClient } from "../../../query";
import { createMcapDecoderRegistry } from "../decoders";
import { readMcapDecodedMessages } from "./read-decoded-messages";
import {
  createDefaultMcapReader,
  createMcapReaderStore,
  type McapChunkReadDebugLog,
  type McapReaderFactory,
} from "../reader";
import { mcapTimelineRangeFromReader } from "./read-timeline-range";
import { readMcapSynchronizedMessageBatch } from "./read-synchronized-message-batch";
import {
  createMcapPredecessorStore,
  type McapPredecessorStore,
} from "./predecessor-store";
import { resolveMcapTimelineStrategy } from "../timeline";
import {
  readMcapFrameTransformBootstrap,
  readMcapFrameTransformWindow,
} from "./read-frame-transforms";
import { readMcapTopics } from "./read-topics";
import { readMcapTopicTimeBounds } from "./read-topic-time-bounds";
import type { McapFrameTransformSet } from "../frame-transform-types";
import {
  type McapDecodedMessage,
  type McapReadDecodedMessagesRequest,
  type McapReadFrameTransformBootstrapRequest,
  type McapReadFrameTransformWindowRequest,
  type McapReadSynchronizedMessageBatchRequest,
  type McapReadSynchronizedMessagesRequest,
  type McapReadTopicsRequest,
  type McapReadTopicTimeBoundsRequest,
  type McapReadTimelineRangeRequest,
  type McapResourceClient,
  type McapSynchronizedMessageWindow,
  type McapTimelineRange,
  type McapTopicTimeBounds,
} from "../types";
import type { StreamInventory } from "../../../schemas/v1";

const FRAME_TRANSFORM_WINDOW_READ_CACHE_LIMIT = 32;

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

/**
 * Creates an MCAP resource client over the generic byte and decode clients.
 */
export function createInlineMcapResourceClient(
  options: CreateInlineMcapResourceClientOptions = {},
): McapResourceClient {
  const query = createMultimodalQueryClient();
  const byteClient = options.byteClient ?? query.bytes;
  const decodeClient =
    options.decodeClient ??
    createDecodeClient({
      cache: query.caches.decoded,
      registry: createMcapDecoderRegistry(),
    });
  const readerFactory = options.readerFactory ?? createDefaultMcapReader;
  const readerStore = createMcapReaderStore({
    byteClient,
    debugChunkReads: options.debugChunkReads,
    logChunkRead: options.logChunkRead,
    readerFactory,
    readSignal: options.readSignal,
  });
  const topicReads = new Map<string, Promise<readonly StreamInventory[]>>();
  const topicTimeBoundsReads = new Map<
    string,
    Promise<readonly McapTopicTimeBounds[]>
  >();
  // Per-source predecessor memos; bounded by topic count, dropped on dispose.
  const predecessorStores = new Map<string, McapPredecessorStore>();
  const frameTransformBootstrapReads = new Map<
    string,
    Promise<McapFrameTransformSet>
  >();
  const frameTransformWindowReads = new LRUCache<
    string,
    Promise<McapFrameTransformSet>
  >({
    max: FRAME_TRANSFORM_WINDOW_READ_CACHE_LIMIT,
  });

  const client: McapResourceClient = {
    dispose() {
      topicReads.clear();
      topicTimeBoundsReads.clear();
      predecessorStores.clear();
      frameTransformBootstrapReads.clear();
      frameTransformWindowReads.clear();
      readerStore.dispose();
    },

    async *readDecodedMessages(
      request: McapReadDecodedMessagesRequest,
    ): AsyncGenerator<McapDecodedMessage, void, void> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      yield* readMcapDecodedMessages({
        decodeClient,
        reader,
        request,
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
      const cached = topicReads.get(sourceKey);
      if (cached) {
        return cached;
      }

      const read = readerStore
        .get(request.source)
        .then((reader) => readMcapTopics(reader))
        .catch((error) => {
          topicReads.delete(sourceKey);
          throw error;
        });
      topicReads.set(sourceKey, read);

      return read;
    },

    async readTopicTimeBounds(request: McapReadTopicTimeBoundsRequest) {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const sourceKey = byteSourceAccessKey(request.source);
      const boundsKey = [sourceKey, timeline.id, ...request.topics].join("\0");
      const cached = topicTimeBoundsReads.get(boundsKey);
      if (cached) {
        return cached;
      }

      const read = readerStore
        .get(request.source)
        .then((reader) => readMcapTopicTimeBounds({ reader, request }))
        .catch((error) => {
          topicTimeBoundsReads.delete(boundsKey);
          throw error;
        });
      topicTimeBoundsReads.set(boundsKey, read);

      return read;
    },

    async readFrameTransformBootstrap(
      request: McapReadFrameTransformBootstrapRequest,
    ): Promise<McapFrameTransformSet> {
      const sourceKey = byteSourceAccessKey(request.source);
      const cached = frameTransformBootstrapReads.get(sourceKey);
      if (cached) {
        return cached;
      }

      const read = readerStore
        .get(request.source)
        .then((reader) => readMcapFrameTransformBootstrap(reader))
        .catch((error) => {
          frameTransformBootstrapReads.delete(sourceKey);
          throw error;
        });
      frameTransformBootstrapReads.set(sourceKey, read);

      return read;
    },

    async readFrameTransformWindow(
      request: McapReadFrameTransformWindowRequest,
    ): Promise<McapFrameTransformSet> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const sourceKey = byteSourceAccessKey(request.source);
      const windowKey = `${sourceKey}\0${timeline.id}\0${request.startTimeNs}\0${request.endTimeNs}`;
      const cached = frameTransformWindowReads.get(windowKey);
      if (cached) {
        return cached;
      }

      const read = readerStore
        .get(request.source)
        .then((reader) =>
          readMcapFrameTransformWindow({ reader, request, timeline }),
        )
        .catch((error) => {
          if (frameTransformWindowReads.get(windowKey) === read) {
            frameTransformWindowReads.delete(windowKey);
          }
          throw error;
        });
      frameTransformWindowReads.set(windowKey, read);

      return read;
    },

    async readSynchronizedMessageBatch(
      request: McapReadSynchronizedMessageBatchRequest,
    ): Promise<readonly McapSynchronizedMessageWindow[]> {
      if (request.timeNs.length === 0) {
        return [];
      }

      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      const sourceKey = byteSourceAccessKey(request.source);
      let predecessorStore = predecessorStores.get(sourceKey);
      if (!predecessorStore) {
        predecessorStore = createMcapPredecessorStore();
        predecessorStores.set(sourceKey, predecessorStore);
      }

      return readMcapSynchronizedMessageBatch({
        decodeClient,
        predecessorStore,
        reader,
        request,
        timeline,
      });
    },

    async readSynchronizedMessages(
      request: McapReadSynchronizedMessagesRequest,
    ): Promise<McapSynchronizedMessageWindow> {
      const windows = await client.readSynchronizedMessageBatch({
        ...request,
        timeNs: [request.timeNs],
      });
      const window = windows[0];
      if (!window) {
        throw new Error("Expected synchronized MCAP window");
      }

      return window;
    },
  };

  return client;
}
