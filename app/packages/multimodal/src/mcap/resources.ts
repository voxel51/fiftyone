import { McapIndexedReader } from "@mcap/core";
import * as mcapSupport from "@mcap/support";
import {
  createDecodeResourceClient,
  defaultMultimodalClient,
  type ByteResourceClient,
  type ByteSourceDescriptor,
  type DecodeExecutor,
  type DecodeResourceClient,
  type DecodeResourceResult,
  type MultimodalResourcesClient,
} from "../client";
import type { DecoderRegistry, PayloadDescriptor } from "../decoders";
import { createMcapDecoderRegistry } from "./decoders";

type DecompressHandlers = Readonly<
  Record<string, (buffer: Uint8Array, decompressedSize: bigint) => Uint8Array>
>;

interface IReadable {
  read(offset: bigint, size: bigint): Promise<Uint8Array>;
  size(): Promise<bigint>;
}

type TypedMcapRecords = {
  Channel: {
    readonly id: number;
    readonly messageEncoding: string;
    readonly metadata: ReadonlyMap<string, string>;
    readonly schemaId: number;
    readonly topic: string;
    readonly type: "Channel";
  };
  Message: {
    readonly channelId: number;
    readonly data: Uint8Array;
    readonly logTime: bigint;
    readonly publishTime: bigint;
    readonly sequence: number;
    readonly type: "Message";
  };
  Schema: {
    readonly data: Uint8Array;
    readonly encoding: string;
    readonly id: number;
    readonly name: string;
    readonly type: "Schema";
  };
};

type McapSupportModule = {
  loadDecompressHandlers(): Promise<DecompressHandlers>;
};

const { loadDecompressHandlers } = mcapSupport as unknown as McapSupportModule;

/**
 * Default tolerance for synchronized MCAP playback windows.
 */
export const DEFAULT_MCAP_SYNC_TOLERANCE_NS = 50_000_000n;

/**
 * MCAP timestamp policies supported by decoded playback reads.
 */
export const MCAP_SYNC_TIME_POLICY = Object.freeze({
  LOG_TIME: "logTime",
  MESSAGE_TIME: "messageTime",
  PUBLISH_TIME: "publishTime",
} as const);

export type McapSyncTimePolicy =
  typeof MCAP_SYNC_TIME_POLICY[keyof typeof MCAP_SYNC_TIME_POLICY];

/**
 * MCAP source identity for byte-range reads.
 */
export type McapSourceDescriptor = ByteSourceDescriptor;

/**
 * Request for decoding an MCAP message window.
 */
export interface McapReadDecodedMessagesRequest {
  readonly endTimeNs?: bigint;
  readonly limit?: number;
  readonly source: McapSourceDescriptor;
  readonly startTimeNs?: bigint;
  readonly syncTimePolicy?: McapSyncTimePolicy;
  readonly topics?: readonly string[];
}

/**
 * Request for a playback-oriented synchronized message window.
 */
export interface McapReadSynchronizedMessagesRequest {
  readonly anchorTimeNs: bigint;
  readonly source: McapSourceDescriptor;
  readonly syncTimePolicy?: McapSyncTimePolicy;
  readonly toleranceAfterNs?: bigint;
  readonly toleranceBeforeNs?: bigint;
  readonly perTopicLimit?: number;
  readonly topics: readonly string[];
}

/**
 * Batch request for playback prefetchers that need multiple synchronized
 * windows from the same source and topic set.
 */
export interface McapReadSynchronizedMessageBatchRequest
  extends Omit<McapReadSynchronizedMessagesRequest, "anchorTimeNs"> {
  readonly anchorTimeNs: readonly bigint[];
}

/**
 * Decoded MCAP message with playback identity and archetype output.
 */
export interface McapDecodedMessage {
  readonly channelId: number;
  readonly decode: DecodeResourceResult;
  readonly logTimeNs: bigint;
  readonly publishTimeNs: bigint;
  readonly sequence: number;
  readonly syncTimeNs: bigint;
  readonly syncTimePolicy: McapSyncTimePolicy;
  readonly topic: string;
}

/**
 * Synchronized MCAP playback window grouped by topic.
 */
export interface McapSynchronizedMessageWindow {
  readonly anchorTimeNs: bigint;
  readonly endTimeNs: bigint;
  readonly messages: readonly McapDecodedMessage[];
  readonly messagesByTopic: Readonly<
    Record<string, readonly McapDecodedMessage[]>
  >;
  readonly startTimeNs: bigint;
  readonly syncTimePolicy: McapSyncTimePolicy;
}

/**
 * MCAP-specific resource client.
 */
export interface McapResourceClient {
  readDecodedMessages(
    request: McapReadDecodedMessagesRequest
  ): AsyncGenerator<McapDecodedMessage, void, void>;

  readSynchronizedMessages(
    request: McapReadSynchronizedMessagesRequest
  ): Promise<McapSynchronizedMessageWindow>;

  readSynchronizedMessageBatch(
    request: McapReadSynchronizedMessageBatchRequest
  ): Promise<readonly McapSynchronizedMessageWindow[]>;
}

/**
 * Reader factory used by MCAP production code and tests.
 */
export type McapReaderFactory = (
  source: McapSourceDescriptor,
  readable: IReadable
) => Promise<McapIndexedReaderLike>;

/**
 * Indexed MCAP reader surface used by this adapter.
 */
export interface McapIndexedReaderLike {
  readonly channelsById: ReadonlyMap<number, TypedMcapRecords["Channel"]>;
  readonly schemasById: ReadonlyMap<number, TypedMcapRecords["Schema"]>;

  readMessages(args?: {
    readonly endTime?: bigint;
    readonly startTime?: bigint;
    readonly topics?: readonly string[];
  }): AsyncGenerator<TypedMcapRecords["Message"], void, void>;
}

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
  const resources = options.resources ?? defaultMultimodalClient.resources;
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
    const syncTimePolicy =
      request.syncTimePolicy ?? MCAP_SYNC_TIME_POLICY.LOG_TIME;
    let count = 0;

    for await (const message of reader.readMessages({
      endTime: request.endTimeNs,
      startTime: request.startTimeNs,
      topics: request.topics,
    })) {
      const decodedMessage = await decodeMessage({
        decodeClient,
        message,
        reader,
        source: request.source,
        syncTimePolicy,
      });

      yield decodedMessage;

      count += 1;
      if (request.limit !== undefined && count >= request.limit) {
        return;
      }
    }
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

    const syncTimePolicy =
      request.syncTimePolicy ?? MCAP_SYNC_TIME_POLICY.LOG_TIME;
    const toleranceBeforeNs =
      request.toleranceBeforeNs ?? DEFAULT_MCAP_SYNC_TOLERANCE_NS;
    const toleranceAfterNs =
      request.toleranceAfterNs ?? DEFAULT_MCAP_SYNC_TOLERANCE_NS;
    const perTopicLimit = request.perTopicLimit ?? 1;
    const windowBounds = request.anchorTimeNs.map((anchorTimeNs) => ({
      anchorTimeNs,
      endTimeNs: anchorTimeNs + toleranceAfterNs,
      startTimeNs: clampStartTime(anchorTimeNs - toleranceBeforeNs),
    }));

    if (syncTimePolicy === MCAP_SYNC_TIME_POLICY.MESSAGE_TIME) {
      const candidatesByTopic = await collectDecodedCandidates({
        endTimeNs: maxBigInt(windowBounds.map((bounds) => bounds.endTimeNs)),
        readDecodedMessages,
        source: request.source,
        startTimeNs: minBigInt(
          windowBounds.map((bounds) => bounds.startTimeNs)
        ),
        syncTimePolicy,
        topics: request.topics,
      });

      return windowBounds.map(({ anchorTimeNs, endTimeNs, startTimeNs }) =>
        selectDecodedWindow({
          anchorTimeNs,
          candidatesByTopic,
          endTimeNs,
          perTopicLimit,
          startTimeNs,
          syncTimePolicy,
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
      endTimeNs: maxBigInt(windowBounds.map((bounds) => bounds.endTimeNs)),
      reader,
      startTimeNs: minBigInt(windowBounds.map((bounds) => bounds.startTimeNs)),
      syncTimePolicy,
      topics: request.topics,
    });
    const decodeCache = new Map<string, Promise<McapDecodedMessage>>();

    return Promise.all(
      windowBounds.map(async ({ anchorTimeNs, endTimeNs, startTimeNs }) => {
        const messagesByTopic: Record<string, readonly McapDecodedMessage[]> =
          {};
        const messages: McapDecodedMessage[] = [];

        for (const topic of request.topics) {
          const selected = (candidates.get(topic) ?? [])
            .filter(
              (message) =>
                message.syncTimeNs >= startTimeNs &&
                message.syncTimeNs <= endTimeNs
            )
            .sort((left, right) =>
              compareRawByDistance(left, right, anchorTimeNs)
            )
            .slice(0, perTopicLimit)
            .sort(compareRawBySyncTime);
          const decoded = await Promise.all(
            selected.map((candidate) =>
              decodeRawCandidate({
                candidate,
                decodeCache,
                decodeClient,
                source: request.source,
                syncTimePolicy,
              })
            )
          );
          messagesByTopic[topic] = decoded;
          messages.push(...decoded);
        }

        messages.sort(compareBySyncTime);

        return {
          anchorTimeNs,
          endTimeNs,
          messages,
          messagesByTopic,
          startTimeNs,
          syncTimePolicy,
        };
      })
    );
  }

  return {
    readDecodedMessages,
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
  syncTimePolicy,
}: {
  readonly decodeClient: DecodeResourceClient;
  readonly channel?: TypedMcapRecords["Channel"];
  readonly message: TypedMcapRecords["Message"];
  readonly reader?: McapIndexedReaderLike;
  readonly schema?: TypedMcapRecords["Schema"];
  readonly source: McapSourceDescriptor;
  readonly syncTimePolicy: McapSyncTimePolicy;
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
  const decode = await decodeClient.decode({
    bytes: message.data,
    cache: {
      decoderOptionsKey: `syncTimePolicy=${syncTimePolicy}`,
      recordId: recordId(message),
      source,
      streamId: topic,
      timeNs: cacheTimeNs(message, syncTimePolicy),
    },
    context: {
      sourceTimestamps: {
        logTime: message.logTime,
        publishTime: message.publishTime,
      },
      streamId: topic,
      timeRangeStartKey: syncTimePolicy,
      topic,
    },
    payload,
    schemaData: resolvedSchema?.data,
  });
  const syncTimeNs = syncTimeNsForDecodedMessage(
    message,
    decode,
    syncTimePolicy
  );

  return {
    channelId: message.channelId,
    decode,
    logTimeNs: message.logTime,
    publishTimeNs: message.publishTime,
    sequence: message.sequence,
    syncTimeNs,
    syncTimePolicy,
    topic,
  };
}

async function collectRawCandidates({
  endTimeNs,
  reader,
  startTimeNs,
  syncTimePolicy,
  topics,
}: {
  readonly endTimeNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly startTimeNs: bigint;
  readonly syncTimePolicy: McapSyncTimePolicy;
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

    const syncTimeNs = rawSyncTimeNs(message, syncTimePolicy);
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
  syncTimePolicy,
  topics,
}: {
  readonly endTimeNs: bigint;
  readonly readDecodedMessages: (
    request: McapReadDecodedMessagesRequest
  ) => AsyncGenerator<McapDecodedMessage, void, void>;
  readonly source: McapSourceDescriptor;
  readonly startTimeNs: bigint;
  readonly syncTimePolicy: McapSyncTimePolicy;
  readonly topics: readonly string[];
}): Promise<Map<string, McapDecodedMessage[]>> {
  const candidatesByTopic = new Map<string, McapDecodedMessage[]>();

  for await (const message of readDecodedMessages({
    endTimeNs,
    source,
    startTimeNs,
    syncTimePolicy,
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
  syncTimePolicy,
}: {
  readonly candidate: McapRawMessageCandidate;
  readonly decodeCache: Map<string, Promise<McapDecodedMessage>>;
  readonly decodeClient: DecodeResourceClient;
  readonly source: McapSourceDescriptor;
  readonly syncTimePolicy: McapSyncTimePolicy;
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
      syncTimePolicy,
    });
    decodeCache.set(key, decoded);
  }

  return decoded;
}

function selectDecodedWindow({
  anchorTimeNs,
  candidatesByTopic,
  endTimeNs,
  perTopicLimit,
  startTimeNs,
  syncTimePolicy,
  topics,
}: {
  readonly anchorTimeNs: bigint;
  readonly candidatesByTopic: ReadonlyMap<
    string,
    readonly McapDecodedMessage[]
  >;
  readonly endTimeNs: bigint;
  readonly perTopicLimit: number;
  readonly startTimeNs: bigint;
  readonly syncTimePolicy: McapSyncTimePolicy;
  readonly topics: readonly string[];
}): McapSynchronizedMessageWindow {
  const messagesByTopic: Record<string, readonly McapDecodedMessage[]> = {};
  const messages: McapDecodedMessage[] = [];
  for (const topic of topics) {
    const selected = [...(candidatesByTopic.get(topic) ?? [])]
      .filter(
        (message) =>
          message.syncTimeNs >= startTimeNs && message.syncTimeNs <= endTimeNs
      )
      .sort((left, right) => compareByDistance(left, right, anchorTimeNs))
      .slice(0, perTopicLimit)
      .sort(compareBySyncTime);
    messagesByTopic[topic] = selected;
    messages.push(...selected);
  }

  messages.sort(compareBySyncTime);

  return {
    anchorTimeNs,
    endTimeNs,
    messages,
    messagesByTopic,
    startTimeNs,
    syncTimePolicy,
  };
}

async function createDefaultMcapReader(
  _source: McapSourceDescriptor,
  readable: IReadable
): Promise<McapIndexedReaderLike> {
  const decompressHandlers = await defaultDecompressHandlers();

  return McapIndexedReader.Initialize({
    decompressHandlers,
    messageIndexCacheSizeBytes: 8 * 1024 * 1024,
    readable,
  });
}

let defaultDecompressHandlersPromise: Promise<DecompressHandlers> | undefined;

function defaultDecompressHandlers(): Promise<DecompressHandlers> {
  defaultDecompressHandlersPromise ??= loadDecompressHandlers();

  return defaultDecompressHandlersPromise;
}

async function getReader(
  readers: Map<string, Promise<McapIndexedReaderLike>>,
  readerFactory: McapReaderFactory,
  byteClient: ByteResourceClient,
  source: McapSourceDescriptor
) {
  const key = sourceKey(source);
  let reader = readers.get(key);

  if (!reader) {
    reader = readerFactory(source, new ByteClientReadable(source, byteClient));
    readers.set(key, reader);
  }

  return reader;
}

class ByteClientReadable implements IReadable {
  constructor(
    private readonly source: McapSourceDescriptor,
    private readonly byteClient: ByteResourceClient
  ) {}

  async size(): Promise<bigint> {
    const sizeBytes =
      this.source.sizeBytes ?? this.source.fingerprint?.sizeBytes;
    if (!sizeBytes) {
      throw new Error("MCAP source size is required for indexed reads");
    }

    return BigInt(sizeBytes);
  }

  async read(offset: bigint, size: bigint): Promise<Uint8Array> {
    if (size === 0n) {
      return new Uint8Array();
    }

    const result = await this.byteClient.readBytes({
      range: { length: size, offset },
      source: this.source,
    });

    return result.bytes;
  }
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

function cacheTimeNs(
  message: TypedMcapRecords["Message"],
  syncTimePolicy: McapSyncTimePolicy
): bigint | undefined {
  switch (syncTimePolicy) {
    case MCAP_SYNC_TIME_POLICY.LOG_TIME:
      return message.logTime;
    case MCAP_SYNC_TIME_POLICY.PUBLISH_TIME:
      return message.publishTime;
    case MCAP_SYNC_TIME_POLICY.MESSAGE_TIME:
      return undefined;
  }
}

function syncTimeNsForDecodedMessage(
  message: TypedMcapRecords["Message"],
  decode: DecodeResourceResult,
  syncTimePolicy: McapSyncTimePolicy
): bigint {
  switch (syncTimePolicy) {
    case MCAP_SYNC_TIME_POLICY.LOG_TIME:
      return message.logTime;
    case MCAP_SYNC_TIME_POLICY.PUBLISH_TIME:
      return message.publishTime;
    case MCAP_SYNC_TIME_POLICY.MESSAGE_TIME:
      return (
        decode.output.timing?.sourceTimestamps?.messageTime ?? message.logTime
      );
  }
}

function rawSyncTimeNs(
  message: TypedMcapRecords["Message"],
  syncTimePolicy: McapSyncTimePolicy
): bigint {
  switch (syncTimePolicy) {
    case MCAP_SYNC_TIME_POLICY.LOG_TIME:
      return message.logTime;
    case MCAP_SYNC_TIME_POLICY.PUBLISH_TIME:
      return message.publishTime;
    case MCAP_SYNC_TIME_POLICY.MESSAGE_TIME:
      return message.logTime;
  }
}

function compareByDistance(
  left: McapDecodedMessage,
  right: McapDecodedMessage,
  anchorTimeNs: bigint
) {
  const leftDistance = absBigInt(left.syncTimeNs - anchorTimeNs);
  const rightDistance = absBigInt(right.syncTimeNs - anchorTimeNs);

  if (leftDistance === rightDistance) {
    return compareBySyncTime(left, right);
  }

  return leftDistance < rightDistance ? -1 : 1;
}

function compareBySyncTime(
  left: McapDecodedMessage,
  right: McapDecodedMessage
) {
  if (left.syncTimeNs === right.syncTimeNs) {
    return left.topic.localeCompare(right.topic);
  }

  return left.syncTimeNs < right.syncTimeNs ? -1 : 1;
}

function compareRawByDistance(
  left: McapRawMessageCandidate,
  right: McapRawMessageCandidate,
  anchorTimeNs: bigint
) {
  const leftDistance = absBigInt(left.syncTimeNs - anchorTimeNs);
  const rightDistance = absBigInt(right.syncTimeNs - anchorTimeNs);

  if (leftDistance === rightDistance) {
    return compareRawBySyncTime(left, right);
  }

  return leftDistance < rightDistance ? -1 : 1;
}

function compareRawBySyncTime(
  left: McapRawMessageCandidate,
  right: McapRawMessageCandidate
) {
  if (left.syncTimeNs !== right.syncTimeNs) {
    return left.syncTimeNs < right.syncTimeNs ? -1 : 1;
  }

  const topicOrder = left.topic.localeCompare(right.topic);
  if (topicOrder !== 0) {
    return topicOrder;
  }

  if (left.message.channelId !== right.message.channelId) {
    return left.message.channelId - right.message.channelId;
  }

  return left.message.sequence - right.message.sequence;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function clampStartTime(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

function minBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) {
    throw new Error("Expected at least one timestamp");
  }

  let min = values[0];
  for (const value of values) {
    if (value < min) {
      min = value;
    }
  }

  return min;
}

function maxBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) {
    throw new Error("Expected at least one timestamp");
  }

  let max = values[0];
  for (const value of values) {
    if (value > max) {
      max = value;
    }
  }

  return max;
}

function recordId(message: TypedMcapRecords["Message"]): string {
  return [
    message.channelId.toString(),
    message.logTime.toString(),
    message.publishTime.toString(),
    message.sequence.toString(),
  ].join(":");
}

function sourceKey(source: McapSourceDescriptor): string {
  return [
    source.sourceId,
    source.url,
    source.sizeBytes ?? source.fingerprint?.sizeBytes ?? "",
    source.fingerprint?.firstChunkCrc?.toString() ?? "",
    source.fingerprint?.lastChunkCrc?.toString() ?? "",
  ].join("|");
}
