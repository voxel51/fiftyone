import type { McapTypes } from "@mcap/core";
import {
  defaultMultimodalResourcesClient,
  type ByteResourceClient,
  type DecodeExecutor,
  type DecodeResourceClient,
  type MultimodalResourcesClient,
} from "../client/resources";
import { createDecodeResourceClient } from "../client/resources/clients";
import type { DecoderRegistry, PayloadDescriptor } from "../decoders";
import { createMcapDecoderRegistry } from "./decoders";
import {
  createDefaultMcapReader,
  getReader,
  type McapIndexedReaderLike,
  type McapReaderFactory,
} from "./reader";
import {
  compareByTimelineTime,
  createWindowBounds,
  isWithinRange,
  maxBigInt,
  minBigInt,
  selectCandidatesForTopic,
} from "./sync";
import { resolveMcapActiveTimeline } from "./timeline";
import {
  type McapActiveTimeline,
  type McapDecodedMessage,
  type McapReadDecodedMessagesRequest,
  type McapReadSynchronizedMessageBatchRequest,
  type McapReadSynchronizedMessagesRequest,
  type McapReadTimelineRangeRequest,
  type McapResourceClient,
  type McapSourceDescriptor,
  type McapSynchronizedMessageWindow,
  type McapTimelineRange,
} from "./types";

type TypedMcapRecords = McapTypes.TypedMcapRecords;

interface McapRawMessageCandidate {
  readonly channel: TypedMcapRecords["Channel"];
  readonly message: TypedMcapRecords["Message"];
  readonly schema?: TypedMcapRecords["Schema"];
  readonly timelineTimeNs: bigint;
  readonly topic: string;
}

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
  const resources = options.resources ?? defaultMultimodalResourcesClient;
  const byteClient = options.byteClient ?? resources.bytes;
  const decodeClient =
    options.decodeClient ??
    createDecodeResourceClient({
      cache: resources.caches.decoded,
      executor: options.decodeExecutor,
      registry: options.decoderRegistry ?? createMcapDecoderRegistry(),
    });
  const readerFactory = options.readerFactory ?? createDefaultMcapReader;
  const readers = new Map<string, Promise<McapIndexedReaderLike>>();

  async function* readDecodedMessages(
    request: McapReadDecodedMessagesRequest
  ): AsyncGenerator<McapDecodedMessage, void, void> {
    const activeTimeline = resolveMcapActiveTimeline(request.activeTimeline);
    const reader = await getReader(
      readers,
      readerFactory,
      byteClient,
      request.source
    );
    let count = 0;

    for await (const message of reader.readMessages({
      endTime: request.endTimeNs,
      startTime: request.startTimeNs,
      topics: request.topics,
    })) {
      const decodedMessage = await decodeMessage({
        activeTimeline,
        decodeClient,
        message,
        reader,
        source: request.source,
      });

      if (
        !isWithinRange(
          decodedMessage.timelineTimeNs,
          request.startTimeNs,
          request.endTimeNs
        )
      ) {
        continue;
      }

      yield decodedMessage;

      count += 1;
      if (request.limit !== undefined && count >= request.limit) {
        return;
      }
    }
  }

  async function readTimelineRange(
    request: McapReadTimelineRangeRequest
  ): Promise<McapTimelineRange> {
    const activeTimeline = resolveMcapActiveTimeline(request.activeTimeline);
    const reader = await getReader(
      readers,
      readerFactory,
      byteClient,
      request.source
    );

    if (reader.chunkIndexes.length === 0) {
      throw new Error("MCAP log timeline has no indexed chunks");
    }

    return {
      activeTimeline,
      endTimeNs: maxBigInt(
        reader.chunkIndexes.map((chunkIndex) => chunkIndex.messageEndTime)
      ),
      startTimeNs: minBigInt(
        reader.chunkIndexes.map((chunkIndex) => chunkIndex.messageStartTime)
      ),
    };
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
    const windowBounds = request.timeNs.map((timeNs) =>
      createWindowBounds({
        timeNs,
        defaultStreamPolicy: request.defaultStreamPolicy,
        streamPolicies: request.streamPolicies,
        topics: request.topics,
      })
    );
    const startTimeNs = minBigInt(
      windowBounds.flatMap((bounds) =>
        Object.values(bounds.streamPolicies).map((policy) => policy.startTimeNs)
      )
    );
    const endTimeNs = maxBigInt(
      windowBounds.flatMap((bounds) =>
        Object.values(bounds.streamPolicies).map((policy) => policy.endTimeNs)
      )
    );

    const reader = await getReader(
      readers,
      readerFactory,
      byteClient,
      request.source
    );
    const candidates = await collectRawCandidates({
      endTimeNs,
      reader,
      startTimeNs,
      topics: request.topics,
    });
    const decodeCache = new Map<string, Promise<McapDecodedMessage>>();

    return Promise.all(
      windowBounds.map(async ({ timeNs, streamPolicies }) => {
        const messagesByTopic: Record<string, readonly McapDecodedMessage[]> =
          {};
        const messages: McapDecodedMessage[] = [];

        for (const topic of request.topics) {
          const selected = selectCandidatesForTopic(
            candidates.get(topic) ?? [],
            timeNs,
            streamPolicies[topic],
            compareRawCandidateTieBreaker
          );
          const decoded = await Promise.all(
            selected.map((candidate) =>
              decodeRawCandidate({
                activeTimeline,
                candidate,
                decodeCache,
                decodeClient,
                source: request.source,
              })
            )
          );
          messagesByTopic[topic] = decoded;
          messages.push(...decoded);
        }

        messages.sort(compareByTimelineTime);

        return {
          activeTimeline,
          endTimeNs: maxBigInt(
            Object.values(streamPolicies).map((policy) => policy.endTimeNs)
          ),
          messages,
          messagesByTopic,
          startTimeNs: minBigInt(
            Object.values(streamPolicies).map((policy) => policy.startTimeNs)
          ),
          streamPolicies,
          timeNs,
        };
      })
    );
  }

  return {
    dispose() {
      readers.clear();
    },
    readDecodedMessages,
    readTimelineRange,
    readSynchronizedMessageBatch,
    readSynchronizedMessages,
  };
}

async function decodeMessage({
  activeTimeline,
  decodeClient,
  channel,
  message,
  reader,
  schema,
  source,
}: {
  readonly activeTimeline: McapActiveTimeline;
  readonly decodeClient: DecodeResourceClient;
  readonly channel?: TypedMcapRecords["Channel"];
  readonly message: TypedMcapRecords["Message"];
  readonly reader?: McapIndexedReaderLike;
  readonly schema?: TypedMcapRecords["Schema"];
  readonly source: McapSourceDescriptor;
}): Promise<McapDecodedMessage> {
  const resolvedChannel =
    channel ?? reader?.channelsById.get(message.channelId);
  if (!resolvedChannel) {
    throw new Error(`Missing MCAP channel ${message.channelId}`);
  }

  const resolvedSchema =
    schema ?? reader?.schemasById.get(resolvedChannel.schemaId);
  const payload = payloadFromChannel(resolvedChannel, resolvedSchema);
  const topic = resolvedChannel.topic;
  const decoded = await decodeClient.decode({
    bytes: message.data,
    cache: {
      decoderOptionsKey: `activeTimeline=${activeTimeline}`,
      recordId: recordId(message),
      source,
      streamId: topic,
      timeNs: message.logTime,
    },
    context: {
      sourceTimestamps: {
        logTime: message.logTime,
        publishTime: message.publishTime,
      },
      streamId: topic,
      timeRangeStartKey: "logTime",
      topic,
    },
    payload,
    schemaData: resolvedSchema?.data,
  });

  return {
    activeTimeline,
    channelId: message.channelId,
    decoded,
    logTimeNs: message.logTime,
    publishTimeNs: message.publishTime,
    sequence: message.sequence,
    timelineTimeNs: message.logTime,
    topic,
  };
}

async function collectRawCandidates({
  endTimeNs,
  reader,
  startTimeNs,
  topics,
}: {
  readonly endTimeNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly startTimeNs: bigint;
  readonly topics: readonly string[];
}): Promise<Map<string, McapRawMessageCandidate[]>> {
  const candidates = new Map<string, McapRawMessageCandidate[]>();

  for await (const message of reader.readMessages({
    endTime: endTimeNs,
    startTime: startTimeNs,
    topics,
  })) {
    const channel = reader.channelsById.get(message.channelId);
    if (!channel) {
      throw new Error(`Missing MCAP channel ${message.channelId}`);
    }

    const timelineTimeNs = message.logTime;
    if (!isWithinRange(timelineTimeNs, startTimeNs, endTimeNs)) {
      continue;
    }

    const topicCandidates = candidates.get(channel.topic) ?? [];
    topicCandidates.push({
      channel,
      message,
      schema: reader.schemasById.get(channel.schemaId),
      timelineTimeNs,
      topic: channel.topic,
    });
    candidates.set(channel.topic, topicCandidates);
  }

  return candidates;
}

async function decodeRawCandidate({
  activeTimeline,
  candidate,
  decodeCache,
  decodeClient,
  source,
}: {
  readonly activeTimeline: McapActiveTimeline;
  readonly candidate: McapRawMessageCandidate;
  readonly decodeCache: Map<string, Promise<McapDecodedMessage>>;
  readonly decodeClient: DecodeResourceClient;
  readonly source: McapSourceDescriptor;
}): Promise<McapDecodedMessage> {
  const key = recordId(candidate.message);
  let decoded = decodeCache.get(key);

  if (!decoded) {
    decoded = decodeMessage({
      activeTimeline,
      channel: candidate.channel,
      decodeClient,
      message: candidate.message,
      schema: candidate.schema,
      source,
    });
    decodeCache.set(key, decoded);
  }

  return decoded;
}

function payloadFromChannel(
  channel: TypedMcapRecords["Channel"],
  schema: TypedMcapRecords["Schema"] | undefined
): PayloadDescriptor {
  return {
    encoding: channel.messageEncoding,
    schema: schema?.name,
    schemaEncoding: schema?.encoding,
  };
}

function compareRawCandidateTieBreaker(
  left: McapRawMessageCandidate,
  right: McapRawMessageCandidate
) {
  if (left.message.channelId !== right.message.channelId) {
    return left.message.channelId - right.message.channelId;
  }

  return left.message.sequence - right.message.sequence;
}

function recordId(message: TypedMcapRecords["Message"]): string {
  return [
    message.channelId.toString(),
    message.logTime.toString(),
    message.publishTime.toString(),
    message.sequence.toString(),
  ].join(":");
}
