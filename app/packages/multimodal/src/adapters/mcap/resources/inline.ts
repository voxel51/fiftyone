import { type ByteClient } from "../../../query/bytes";
import { type DecodeClient, createDecodeClient } from "../../../query/decode";
import { createMultimodalQueryClient } from "../../../query";
import { createMcapDecoderRegistry } from "../decoders";
import { readMcapDecodedMessages } from "./read-decoded-messages";
import {
  createDefaultMcapReader,
  createMcapReaderStore,
  type McapReaderFactory,
} from "../reader";
import { mcapTimelineRangeFromReader } from "./read-timeline-range";
import { readMcapSynchronizedMessageBatch } from "./read-synchronized-message-batch";
import { resolveMcapTimelineStrategy } from "../timeline";
import { readMcapTopics } from "./read-topics";
import {
  type McapDecodedMessage,
  type McapReadDecodedMessagesRequest,
  type McapReadSynchronizedMessageBatchRequest,
  type McapReadSynchronizedMessagesRequest,
  type McapReadTopicsRequest,
  type McapReadTimelineRangeRequest,
  type McapResourceClient,
  type McapSynchronizedMessageWindow,
  type McapTimelineRange,
} from "../types";

/**
 * Inline-only options for constructing an MCAP resource client.
 */
export interface CreateInlineMcapResourceClientOptions {
  readonly byteClient?: ByteClient;
  readonly decodeClient?: DecodeClient;
  readonly readerFactory?: McapReaderFactory;
}

/**
 * Creates an MCAP resource client over the generic byte and decode clients.
 */
export function createInlineMcapResourceClient(
  options: CreateInlineMcapResourceClientOptions = {}
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
  const readerStore = createMcapReaderStore({ byteClient, readerFactory });

  const client: McapResourceClient = {
    dispose() {
      readerStore.dispose();
    },

    async *readDecodedMessages(
      request: McapReadDecodedMessagesRequest
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
      request: McapReadTimelineRangeRequest
    ): Promise<McapTimelineRange> {
      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      return mcapTimelineRangeFromReader(reader, timeline);
    },

    async readTopics(request: McapReadTopicsRequest) {
      const reader = await readerStore.get(request.source);
      return readMcapTopics(reader);
    },

    async readSynchronizedMessageBatch(
      request: McapReadSynchronizedMessageBatchRequest
    ): Promise<readonly McapSynchronizedMessageWindow[]> {
      if (request.timeNs.length === 0) {
        return [];
      }

      const timeline = resolveMcapTimelineStrategy(request.activeTimeline);
      const reader = await readerStore.get(request.source);
      return readMcapSynchronizedMessageBatch({
        decodeClient,
        reader,
        request,
        timeline,
      });
    },

    async readSynchronizedMessages(
      request: McapReadSynchronizedMessagesRequest
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
