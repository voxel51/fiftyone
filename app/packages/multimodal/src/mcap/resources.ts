import type { McapTypes } from "@mcap/core";
import {
  defaultMultimodalResourcesClient,
  type ByteResourceClient,
  type DecodeExecutor,
  type DecodeResourceClient,
  type DecodeResourceResult,
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
  compareBigInt,
  compareBySyncTime,
  createWindowBounds,
  isWithinRange,
  maxBigInt,
  minBigInt,
  selectCandidatesForTopic,
  selectSynchronizedWindow,
} from "./sync";
import {
  MCAP_TIMESTAMP_SOURCE,
  type McapDecodedMessage,
  type McapMessageTime,
  type McapReadDecodedMessagesRequest,
  type McapReadMessageTimesRequest,
  type McapReadSynchronizedMessageBatchRequest,
  type McapReadSynchronizedMessagesRequest,
  type McapReadTimelineAnchorsRequest,
  type McapResourceClient,
  type McapSourceDescriptor,
  type McapSynchronizedMessageWindow,
  type McapTimestampSource,
} from "./types";

type TypedMcapRecords = McapTypes.TypedMcapRecords;

interface McapRawMessageCandidate {
  readonly channel: TypedMcapRecords["Channel"];
  readonly message: TypedMcapRecords["Message"];
  readonly schema?: TypedMcapRecords["Schema"];
  readonly syncTimeNs: bigint;
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
    const reader = await getReader(
      readers,
      readerFactory,
      byteClient,
      request.source
    );
    const timestampSource =
      request.timestampSource ?? MCAP_TIMESTAMP_SOURCE.LOG_TIME;
    let count = 0;

    for await (const message of reader.readMessages({
      endTime: indexedEndTimeNs(request.endTimeNs, timestampSource),
      startTime: indexedStartTimeNs(request.startTimeNs, timestampSource),
      topics: request.topics,
    })) {
      const decodedMessage = await decodeMessage({
        decodeClient,
        message,
        reader,
        source: request.source,
        timestampSource,
      });

      if (
        !isWithinRange(
          decodedMessage.syncTimeNs,
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

  async function* readMessageTimes(
    request: McapReadMessageTimesRequest
  ): AsyncGenerator<McapMessageTime, void, void> {
    const reader = await getReader(
      readers,
      readerFactory,
      byteClient,
      request.source
    );
    const timestampSource =
      request.timestampSource ?? MCAP_TIMESTAMP_SOURCE.LOG_TIME;

    if (timestampSource === MCAP_TIMESTAMP_SOURCE.HEADER_TIME) {
      for await (const message of readDecodedMessages(request)) {
        yield {
          channelId: message.channelId,
          logTimeNs: message.logTimeNs,
          publishTimeNs: message.publishTimeNs,
          sequence: message.sequence,
          syncTimeNs: message.syncTimeNs,
          timestampSource,
          topic: message.topic,
        };
      }
      return;
    }

    let count = 0;

    for await (const message of reader.readMessages({
      endTime: indexedEndTimeNs(request.endTimeNs, timestampSource),
      startTime: indexedStartTimeNs(request.startTimeNs, timestampSource),
      topics: request.topics,
    })) {
      const channel = reader.channelsById.get(message.channelId);
      if (!channel) {
        throw new Error(`Missing MCAP channel ${message.channelId}`);
      }
      const syncTimeNs = rawSyncTimeNs(message, timestampSource);
      if (!isWithinRange(syncTimeNs, request.startTimeNs, request.endTimeNs)) {
        continue;
      }

      yield {
        channelId: message.channelId,
        logTimeNs: message.logTime,
        publishTimeNs: message.publishTime,
        sequence: message.sequence,
        syncTimeNs,
        timestampSource,
        topic: channel.topic,
      };

      count += 1;
      if (request.limit !== undefined && count >= request.limit) {
        return;
      }
    }
  }

  async function readTimelineAnchors(
    request: McapReadTimelineAnchorsRequest
  ): Promise<readonly bigint[]> {
    const anchors: bigint[] = [];

    for await (const message of readMessageTimes({
      endTimeNs: request.endTimeNs,
      limit: request.limit,
      source: request.source,
      startTimeNs: request.startTimeNs,
      timestampSource: request.timestampSource,
      topics: [request.topic],
    })) {
      anchors.push(message.syncTimeNs);
    }

    return anchors.sort(compareBigInt);
  }

  async function readSynchronizedMessages(
    request: McapReadSynchronizedMessagesRequest
  ): Promise<McapSynchronizedMessageWindow> {
    const windows = await readSynchronizedMessageBatch({
      ...request,
      anchorTimeNs: [request.anchorTimeNs],
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
    if (request.anchorTimeNs.length === 0) {
      return [];
    }

    const timestampSource =
      request.timestampSource ?? MCAP_TIMESTAMP_SOURCE.LOG_TIME;
    const windowBounds = request.anchorTimeNs.map((anchorTimeNs) =>
      createWindowBounds({
        anchorTimeNs,
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

    if (timestampSource === MCAP_TIMESTAMP_SOURCE.HEADER_TIME) {
      const candidatesByTopic = await collectDecodedCandidates({
        endTimeNs,
        readDecodedMessages,
        source: request.source,
        startTimeNs,
        timestampSource,
        topics: request.topics,
      });

      return windowBounds.map(({ anchorTimeNs, streamPolicies }) =>
        selectSynchronizedWindow({
          anchorTimeNs,
          candidatesByTopic,
          streamPolicies,
          timestampSource,
          topics: request.topics,
        })
      );
    }

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
      timestampSource,
      topics: request.topics,
    });
    const decodeCache = new Map<string, Promise<McapDecodedMessage>>();

    return Promise.all(
      windowBounds.map(async ({ anchorTimeNs, streamPolicies }) => {
        const messagesByTopic: Record<string, readonly McapDecodedMessage[]> =
          {};
        const messages: McapDecodedMessage[] = [];

        for (const topic of request.topics) {
          const selected = selectCandidatesForTopic(
            candidates.get(topic) ?? [],
            anchorTimeNs,
            streamPolicies[topic],
            compareRawCandidateTieBreaker
          );
          const decoded = await Promise.all(
            selected.map((candidate) =>
              decodeRawCandidate({
                candidate,
                decodeCache,
                decodeClient,
                source: request.source,
                timestampSource,
              })
            )
          );
          messagesByTopic[topic] = decoded;
          messages.push(...decoded);
        }

        messages.sort(compareBySyncTime);

        return {
          anchorTimeNs,
          endTimeNs: maxBigInt(
            Object.values(streamPolicies).map((policy) => policy.endTimeNs)
          ),
          messages,
          messagesByTopic,
          startTimeNs: minBigInt(
            Object.values(streamPolicies).map((policy) => policy.startTimeNs)
          ),
          streamPolicies,
          timestampSource,
        };
      })
    );
  }

  return {
    dispose() {
      readers.clear();
    },
    readDecodedMessages,
    readMessageTimes,
    readTimelineAnchors,
    readSynchronizedMessageBatch,
    readSynchronizedMessages,
  };
}

async function decodeMessage({
  decodeClient,
  channel,
  message,
  reader,
  schema,
  source,
  timestampSource,
}: {
  readonly decodeClient: DecodeResourceClient;
  readonly channel?: TypedMcapRecords["Channel"];
  readonly message: TypedMcapRecords["Message"];
  readonly reader?: McapIndexedReaderLike;
  readonly schema?: TypedMcapRecords["Schema"];
  readonly source: McapSourceDescriptor;
  readonly timestampSource: McapTimestampSource;
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
      decoderOptionsKey: `timestampSource=${timestampSource}`,
      recordId: recordId(message),
      source,
      streamId: topic,
      timeNs: cacheTimeNs(message, timestampSource),
    },
    context: {
      sourceTimestamps: {
        logTime: message.logTime,
        publishTime: message.publishTime,
      },
      streamId: topic,
      timeRangeStartKey: timestampKey(timestampSource),
      topic,
    },
    payload,
    schemaData: resolvedSchema?.data,
  });
  const syncTimeNs = syncTimeNsForDecodedMessage(
    message,
    decoded,
    timestampSource
  );

  return {
    channelId: message.channelId,
    decoded,
    logTimeNs: message.logTime,
    publishTimeNs: message.publishTime,
    sequence: message.sequence,
    syncTimeNs,
    timestampSource,
    topic,
  };
}

async function collectRawCandidates({
  endTimeNs,
  reader,
  startTimeNs,
  timestampSource,
  topics,
}: {
  readonly endTimeNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly startTimeNs: bigint;
  readonly timestampSource: McapTimestampSource;
  readonly topics: readonly string[];
}): Promise<Map<string, McapRawMessageCandidate[]>> {
  const candidates = new Map<string, McapRawMessageCandidate[]>();

  for await (const message of reader.readMessages({
    endTime: indexedEndTimeNs(endTimeNs, timestampSource),
    startTime: indexedStartTimeNs(startTimeNs, timestampSource),
    topics,
  })) {
    const channel = reader.channelsById.get(message.channelId);
    if (!channel) {
      throw new Error(`Missing MCAP channel ${message.channelId}`);
    }

    const syncTimeNs = rawSyncTimeNs(message, timestampSource);
    if (!isWithinRange(syncTimeNs, startTimeNs, endTimeNs)) {
      continue;
    }

    const topicCandidates = candidates.get(channel.topic) ?? [];
    topicCandidates.push({
      channel,
      message,
      schema: reader.schemasById.get(channel.schemaId),
      syncTimeNs,
      topic: channel.topic,
    });
    candidates.set(channel.topic, topicCandidates);
  }

  return candidates;
}

async function collectDecodedCandidates({
  endTimeNs,
  readDecodedMessages,
  source,
  startTimeNs,
  timestampSource,
  topics,
}: {
  readonly endTimeNs: bigint;
  readonly readDecodedMessages: (
    request: McapReadDecodedMessagesRequest
  ) => AsyncGenerator<McapDecodedMessage, void, void>;
  readonly source: McapSourceDescriptor;
  readonly startTimeNs: bigint;
  readonly timestampSource: McapTimestampSource;
  readonly topics: readonly string[];
}): Promise<Map<string, McapDecodedMessage[]>> {
  const candidatesByTopic = new Map<string, McapDecodedMessage[]>();

  for await (const message of readDecodedMessages({
    endTimeNs,
    source,
    startTimeNs,
    timestampSource,
    topics,
  })) {
    if (message.syncTimeNs < startTimeNs || message.syncTimeNs > endTimeNs) {
      continue;
    }

    const topicMessages = candidatesByTopic.get(message.topic) ?? [];
    topicMessages.push(message);
    candidatesByTopic.set(message.topic, topicMessages);
  }

  return candidatesByTopic;
}

async function decodeRawCandidate({
  candidate,
  decodeCache,
  decodeClient,
  source,
  timestampSource,
}: {
  readonly candidate: McapRawMessageCandidate;
  readonly decodeCache: Map<string, Promise<McapDecodedMessage>>;
  readonly decodeClient: DecodeResourceClient;
  readonly source: McapSourceDescriptor;
  readonly timestampSource: McapTimestampSource;
}): Promise<McapDecodedMessage> {
  const key = recordId(candidate.message);
  let decoded = decodeCache.get(key);

  if (!decoded) {
    decoded = decodeMessage({
      channel: candidate.channel,
      decodeClient,
      message: candidate.message,
      schema: candidate.schema,
      source,
      timestampSource,
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

function indexedStartTimeNs(
  startTimeNs: bigint | undefined,
  timestampSource: McapTimestampSource
): bigint | undefined {
  return timestampSource === MCAP_TIMESTAMP_SOURCE.LOG_TIME
    ? startTimeNs
    : undefined;
}

function indexedEndTimeNs(
  endTimeNs: bigint | undefined,
  timestampSource: McapTimestampSource
): bigint | undefined {
  return timestampSource === MCAP_TIMESTAMP_SOURCE.LOG_TIME
    ? endTimeNs
    : undefined;
}

function timestampKey(timestampSource: McapTimestampSource) {
  switch (timestampSource) {
    case MCAP_TIMESTAMP_SOURCE.LOG_TIME:
      return "logTime";
    case MCAP_TIMESTAMP_SOURCE.PUBLISH_TIME:
      return "publishTime";
    case MCAP_TIMESTAMP_SOURCE.HEADER_TIME:
      return "messageTime";
  }
}

function cacheTimeNs(
  message: TypedMcapRecords["Message"],
  timestampSource: McapTimestampSource
): bigint | undefined {
  switch (timestampSource) {
    case MCAP_TIMESTAMP_SOURCE.LOG_TIME:
      return message.logTime;
    case MCAP_TIMESTAMP_SOURCE.PUBLISH_TIME:
      return message.publishTime;
    case MCAP_TIMESTAMP_SOURCE.HEADER_TIME:
      return undefined;
  }
}

function syncTimeNsForDecodedMessage(
  message: TypedMcapRecords["Message"],
  decoded: DecodeResourceResult,
  timestampSource: McapTimestampSource
): bigint {
  switch (timestampSource) {
    case MCAP_TIMESTAMP_SOURCE.LOG_TIME:
      return message.logTime;
    case MCAP_TIMESTAMP_SOURCE.PUBLISH_TIME:
      return message.publishTime;
    case MCAP_TIMESTAMP_SOURCE.HEADER_TIME:
      return (
        decoded.output.timing?.sourceTimestamps?.messageTime ?? message.logTime
      );
  }
}

function rawSyncTimeNs(
  message: TypedMcapRecords["Message"],
  timestampSource: McapTimestampSource
): bigint {
  switch (timestampSource) {
    case MCAP_TIMESTAMP_SOURCE.LOG_TIME:
      return message.logTime;
    case MCAP_TIMESTAMP_SOURCE.PUBLISH_TIME:
      return message.publishTime;
    case MCAP_TIMESTAMP_SOURCE.HEADER_TIME:
      return message.logTime;
  }
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
