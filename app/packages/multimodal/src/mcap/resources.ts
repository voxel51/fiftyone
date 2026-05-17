import {
  type ByteResourceClient,
  type DecodeExecutor,
  type DecodeResourceClient,
  type MultimodalResourcesClient,
  createMultimodalResourcesClient,
} from "../client/resources";
import { createDecodeResourceClient } from "../client/resources/clients";
import type { DecoderRegistry } from "../decoders";
import { createMcapDecoderRegistry } from "./decoders";
import { readMcapDecodedMessages } from "./decoded-messages";
import {
  createDefaultMcapReader,
  createMcapReaderStore,
  type McapReaderFactory,
} from "./reader";
import { mcapTimelineRangeFromReader } from "./timeline-range";
import { readMcapSynchronizedMessageBatch } from "./synchronized-reader";
import { resolveMcapActiveTimeline } from "./timeline";
import {
  type McapDecodedMessage,
  type McapReadDecodedMessagesRequest,
  type McapReadSynchronizedMessageBatchRequest,
  type McapReadSynchronizedMessagesRequest,
  type McapReadTimelineRangeRequest,
  type McapResourceClient,
  type McapSynchronizedMessageWindow,
  type McapTimelineRange,
} from "./types";

/**
 * Options for constructing an MCAP resource client.
 */
export interface CreateMcapResourceClientOptions {
  readonly byteClient?: ByteResourceClient;
  readonly decodeClient?: DecodeResourceClient;
  readonly decodeExecutor?: DecodeExecutor;
  readonly decoderRegistry?: DecoderRegistry;
  readonly readerFactory?: McapReaderFactory;
  readonly resources?: MultimodalResourcesClient;
}

/**
 * Creates an MCAP resource client over the generic byte and decode clients.
 */
export function createMcapResourceClient(
  options: CreateMcapResourceClientOptions = {}
): McapResourceClient {
  const resources = options.resources ?? createMultimodalResourcesClient();
  const byteClient = options.byteClient ?? resources.bytes;
  const decodeClient =
    options.decodeClient ??
    createDecodeResourceClient({
      cache: resources.caches.decoded,
      executor: options.decodeExecutor,
      registry: options.decoderRegistry ?? createMcapDecoderRegistry(),
    });
  const readerFactory = options.readerFactory ?? createDefaultMcapReader;
  const readerStore = createMcapReaderStore({ byteClient, readerFactory });

  async function* readDecodedMessages(
    request: McapReadDecodedMessagesRequest
  ): AsyncGenerator<McapDecodedMessage, void, void> {
    const activeTimeline = resolveMcapActiveTimeline(request.activeTimeline);
    const reader = await readerStore.get(request.source);
    yield* readMcapDecodedMessages({
      activeTimeline,
      decodeClient,
      reader,
      request,
    });
  }

  async function readTimelineRange(
    request: McapReadTimelineRangeRequest
  ): Promise<McapTimelineRange> {
    const activeTimeline = resolveMcapActiveTimeline(request.activeTimeline);
    const reader = await readerStore.get(request.source);
    return mcapTimelineRangeFromReader(reader, activeTimeline);
  }

  async function readSynchronizedMessages(
    request: McapReadSynchronizedMessagesRequest
  ): Promise<McapSynchronizedMessageWindow> {
    const windows = await readSynchronizedMessageBatch({
      ...request,
      timeNs: [request.timeNs],
    });
    const window = windows[0];
    if (!window) {
      throw new Error("Expected synchronized MCAP window");
    }

    return window;
  }

  async function readSynchronizedMessageBatch(
    request: McapReadSynchronizedMessageBatchRequest
  ): Promise<readonly McapSynchronizedMessageWindow[]> {
    if (request.timeNs.length === 0) {
      return [];
    }

    const activeTimeline = resolveMcapActiveTimeline(request.activeTimeline);
    const reader = await readerStore.get(request.source);
    return readMcapSynchronizedMessageBatch({
      activeTimeline,
      decodeClient,
      reader,
      request,
    });
  }

  return {
    dispose() {
      readerStore.dispose();
    },
    readDecodedMessages,
    readTimelineRange,
    readSynchronizedMessageBatch,
    readSynchronizedMessages,
  };
}
