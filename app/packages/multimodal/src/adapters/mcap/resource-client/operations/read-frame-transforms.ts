import type { McapTypes } from "@mcap/core";
import {
  EpisodeReadCancelledError,
  isEpisodeReadCancelledError,
} from "../../../../ports/index";
import type { Type } from "protobufjs";
import { Quaternion, Vector3 } from "three";
import { decodeProtobufMessage } from "../../message-decoders/foxglove/protobuf/index";
import {
  asRecord,
  optionalBigInt,
  optionalRecord,
  optionalString,
  requiredArray,
  requiredNumber,
} from "../../message-decoders/foxglove/protobuf/records";
import {
  rosMessageDefinitionsForChannel,
  rosRecordDecoderForChannel,
  rootRosMessageDefinition,
  type RosMessageDefinition,
} from "../../message-decoders/ros/wire";
import { protobufFromBinaryDescriptor } from "../../compatibility/mcap-support";
import { timestampNs } from "../../message-decoders/foxglove/protobuf/timing";
import type {
  McapBoundedMessageReadResult,
  McapIndexedMessageTime,
  McapIndexedReaderLike,
  McapReadContinuation,
} from "../../reader/index";
import type { McapTimelineStrategy } from "../timeline";
import type { McapPredecessorStore } from "../predecessor-store";
import type {
  McapFrameTransformPlacementCoverage,
  McapFrameTransformSample,
  McapFrameTransformSet,
  McapFrameTransformTopicStats,
} from "../../transforms/types";
import {
  compareFrameTransformSamplesByTime,
  frameTransformEdgeKey,
} from "../../transforms/wire";
import { isWithinRange } from "../../synchronization/policy";
import type { McapReadFrameTransformWindowRequest } from "../../contracts/index";

const PROTOBUF_ENCODING = "protobuf";
const FOXGLOVE_FRAME_TRANSFORM_CDR_SCHEMA = "foxglove_msgs/msg/FrameTransform";
const FOXGLOVE_FRAME_TRANSFORMS_CDR_SCHEMA =
  "foxglove_msgs/msg/FrameTransforms";
const FOXGLOVE_FRAME_TRANSFORMS_SCHEMA = "foxglove.FrameTransforms";
const TF_MESSAGE_BATCH_FIELD = "transforms";
const TRANSFORM_PREDECESSOR_MESSAGES_PER_TOPIC = 32;
const TRANSFORM_PLACEMENT_PREDECESSOR_LIMITS = [
  32, 128, 512, 2_048, 4_096,
] as const;
const BOOTSTRAP_BOUNDED_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const BOOTSTRAP_BOUNDED_MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const BOOTSTRAP_BOUNDED_MAX_WALL_TIME_MS = 10_000;

const SUPPORTED_TRANSFORM_SCHEMAS: ReadonlySet<string> = new Set([
  "foxglove.FrameTransform",
  FOXGLOVE_FRAME_TRANSFORMS_SCHEMA,
]);
const ROS_TF_MESSAGE_SCHEMAS: ReadonlySet<string> = new Set([
  "tf2_msgs/TFMessage",
  "tf2_msgs/msg/TFMessage",
]);
const ROS_TRANSFORM_STAMPED_SCHEMAS: ReadonlySet<string> = new Set([
  "geometry_msgs/TransformStamped",
  "geometry_msgs/msg/TransformStamped",
]);
const FOXGLOVE_CDR_TRANSFORM_SCHEMAS: ReadonlySet<string> = new Set([
  FOXGLOVE_FRAME_TRANSFORM_CDR_SCHEMA,
]);
const FOXGLOVE_CDR_TRANSFORMS_SCHEMAS: ReadonlySet<string> = new Set([
  FOXGLOVE_FRAME_TRANSFORMS_CDR_SCHEMA,
]);

type FrameTransformSchemaMatch =
  | {
      readonly format: "foxglove";
      readonly kind: "single";
    }
  | {
      readonly format: "foxglove" | "ros-tf-message";
      readonly kind: "batch";
      readonly repeatedFieldName: string;
    };

/**
 * Bootstrap only scans channels that are likely static, and only when they
 * are small. Topic conventions such as `/tf_static` are accepted directly;
 * ambiguous low-count channels are first classified by decoding one transform
 * message. Dynamic channels are left to bounded window reads instead of
 * blocking first playback.
 */
const BOOTSTRAP_CHANNEL_MESSAGE_CAP = 256n;
const BOOTSTRAP_CHANNEL_MESSAGE_LIMIT =
  Number(BOOTSTRAP_CHANNEL_MESSAGE_CAP) + 1;
const STATIC_TRANSFORM_TOPIC_SEGMENTS: ReadonlySet<string> = new Set([
  "static_tf",
  "static_transform",
  "static_transforms",
  "tf_static",
]);

type McapChannel = McapTypes.TypedMcapRecords["Channel"];
type McapChunkIndex = McapTypes.TypedMcapRecords["ChunkIndex"];
type McapMessage = McapTypes.TypedMcapRecords["Message"];
type McapSchema = McapTypes.TypedMcapRecords["Schema"];

interface FrameTransformChannel {
  readonly channel: McapChannel;
  readonly decodeRecord: (message: McapMessage) => Record<string, unknown>;
  readonly match: FrameTransformSchemaMatch;
  readonly messageCount: bigint | undefined;
}

interface FrameTransformReadStats {
  encodedPayloadBytes: number;
  messageCount: number;
  topicStats: Map<string, McapFrameTransformTopicStats>;
  topics: readonly string[];
}

/**
 * Static channels whose whole-file bootstrap read completed on this reader.
 * Dynamic runway reads can safely omit only these exact channels; deferred
 * bootstrap channels retain the existing window/predecessor fallback.
 */
const bootstrappedStaticChannelIdsByReader = new WeakMap<
  McapIndexedReaderLike,
  ReadonlySet<number>
>();

/**
 * Discovers transform-capable channels from MCAP summary metadata. Footer-only;
 * does not read messages. A channel qualifies when its schema is a known
 * Foxglove frame transform schema or a ROS tf2_msgs/TFMessage schema and both
 * channel and schema encodings are decodable today.
 */
function discoverFrameTransformChannels(
  reader: McapIndexedReaderLike,
): readonly FrameTransformChannel[] {
  const channels: FrameTransformChannel[] = [];
  for (const channel of reader.channelsById.values()) {
    const schema = reader.schemasById.get(channel.schemaId);
    if (!schema) {
      continue;
    }
    const decoder = frameTransformDecoderForChannel(reader, channel, schema);
    if (!decoder) {
      continue;
    }
    channels.push({
      channel,
      ...decoder,
      messageCount: reader.statistics?.channelMessageCounts.get(channel.id),
    });
  }

  return channels;
}

function frameTransformDecoderForChannel(
  reader: McapIndexedReaderLike,
  channel: McapChannel,
  schema: McapSchema,
): Pick<FrameTransformChannel, "decodeRecord" | "match"> | null {
  if (
    channel.messageEncoding === PROTOBUF_ENCODING &&
    schema.encoding === PROTOBUF_ENCODING
  ) {
    const match = classifyProtobufFrameTransformSchema(schema);
    if (!match) {
      return null;
    }

    return {
      decodeRecord: (message) =>
        decodeProtobufMessage(
          message.data,
          {
            encoding: channel.messageEncoding,
            schema: schema.name,
            schemaEncoding: schema.encoding,
          },
          {
            schemaData: schema.data,
            sourceTimestamps: {
              logTime: message.logTime,
              publishTime: message.publishTime,
            },
            streamId: channel.topic,
          },
        ),
      match,
    };
  }

  const match = classifyRosFrameTransformSchema(reader, channel, schema);
  if (!match) {
    return null;
  }
  const decodeRosRecord = rosRecordDecoderForChannel(reader, channel);
  if (!decodeRosRecord) {
    return null;
  }

  return {
    decodeRecord: (message) => decodeRosRecord(message.data),
    match,
  };
}

/**
 * Reads eager static frame transforms by schema discovery. A channel is
 * scanned in bootstrap only if it is below the bootstrap cap and either has a
 * known static-transform topic convention or an ambiguous first decoded sample
 * with no timestamp. This keeps bootstrap off broad dynamic transform channels.
 * A sample is emitted as static when the decoded transform message has no
 * `timestamp` (Foxglove convention for "always valid").
 */
export async function readMcapFrameTransformBootstrap(
  reader: McapIndexedReaderLike,
): Promise<McapFrameTransformSet> {
  const boundedMessages: McapMessage[] = [];
  const completedStaticChannelIds = new Set<number>();
  const windowedSampleChannelIds = new Set<number>();
  const fallbackChannels: FrameTransformChannel[] = [];
  const bootstrapChannelsById = new Map<number, FrameTransformChannel>();
  // Admission stays per-channel so a missing footer count cannot hide one
  // broad topic inside an otherwise small aggregate read budget.
  for (const entry of discoverFrameTransformChannels(reader)) {
    if (await frameTransformChannelExceedsBootstrapCap(reader, entry)) {
      continue;
    }

    const bounded = await readBoundedFrameTransformChannel(reader, entry);
    if (bounded.kind === "deferred") {
      continue;
    }
    if (isStaticTransformBootstrapTopic(entry.channel.topic)) {
      if (bounded.kind === "complete") {
        boundedMessages.push(...bounded.messages);
        completedStaticChannelIds.add(entry.channel.id);
        bootstrapChannelsById.set(entry.channel.id, entry);
      } else {
        fallbackChannels.push(entry);
        bootstrapChannelsById.set(entry.channel.id, entry);
      }
      continue;
    }

    if (bounded.kind === "complete") {
      if (firstMessageHasStaticSample(entry, bounded.messages)) {
        boundedMessages.push(...bounded.messages);
        bootstrapChannelsById.set(entry.channel.id, entry);
      }
      continue;
    }
    if (await firstTransformMessageHasStaticSample(reader, entry)) {
      fallbackChannels.push(entry);
      bootstrapChannelsById.set(entry.channel.id, entry);
    }
  }
  if (boundedMessages.length === 0 && fallbackChannels.length === 0) {
    rememberBootstrappedStaticChannels(reader, completedStaticChannelIds);
    return createMcapFrameTransformSet({ samples: [] });
  }
  const bootstrapChannels = [...bootstrapChannelsById.values()];
  const channelsById = indexByChannelId(bootstrapChannels);
  const readStats = createFrameTransformReadStats(
    bootstrapChannels.map((entry) => entry.channel.topic),
  );

  const samples: McapFrameTransformSample[] = [];
  for (const message of boundedMessages) {
    recordBootstrapMessage({
      channelsById,
      message,
      readStats,
      samples,
      windowedSampleChannelIds,
    });
  }
  if (fallbackChannels.length > 0) {
    for await (const message of reader.readMessages({
      topics: fallbackChannels.map((entry) => entry.channel.topic),
    })) {
      recordBootstrapMessage({
        channelsById,
        message,
        readStats,
        samples,
        windowedSampleChannelIds,
      });
    }
    for (const entry of fallbackChannels) {
      if (isStaticTransformBootstrapTopic(entry.channel.topic)) {
        completedStaticChannelIds.add(entry.channel.id);
      }
    }
  }

  // A complete read is reusable only when bootstrap retained every decoded
  // sample. Timestamped transforms remain window-scoped, so their channels
  // must keep the regular window and predecessor path.
  for (const channelId of windowedSampleChannelIds) {
    completedStaticChannelIds.delete(channelId);
  }

  rememberBootstrappedStaticChannels(reader, completedStaticChannelIds);
  return createMcapFrameTransformSet({ readStats, samples });
}

function rememberBootstrappedStaticChannels(
  reader: McapIndexedReaderLike,
  channelIds: ReadonlySet<number>,
): void {
  if (channelIds.size === 0) {
    return;
  }
  const previous = bootstrappedStaticChannelIdsByReader.get(reader);
  bootstrappedStaticChannelIdsByReader.set(
    reader,
    previous ? new Set([...previous, ...channelIds]) : new Set(channelIds),
  );
}

function recordBootstrapMessage({
  channelsById,
  message,
  readStats,
  samples,
  windowedSampleChannelIds,
}: {
  readonly channelsById: ReadonlyMap<number, FrameTransformChannel>;
  readonly message: McapMessage;
  readonly readStats: FrameTransformReadStats;
  readonly samples: McapFrameTransformSample[];
  readonly windowedSampleChannelIds: Set<number>;
}): void {
  const entry = channelsById.get(message.channelId);
  if (!entry) {
    return;
  }
  recordFrameTransformMessage(readStats, entry.channel.topic, message);
  try {
    for (const sample of normalizeFrameTransformMessage({
      entry,
      message,
    })) {
      if (sample.timeNs === undefined) {
        samples.push(sample);
      } else {
        windowedSampleChannelIds.add(entry.channel.id);
      }
    }
  } catch {
    return;
  }
}

async function frameTransformChannelExceedsBootstrapCap(
  reader: McapIndexedReaderLike,
  entry: FrameTransformChannel,
): Promise<boolean> {
  if (entry.messageCount !== undefined) {
    return entry.messageCount > BOOTSTRAP_CHANNEL_MESSAGE_CAP;
  }

  const indexedChunks = chunksForChannel(reader, entry.channel.id);
  if (indexedChunks.length > Number(BOOTSTRAP_CHANNEL_MESSAGE_CAP)) {
    return true;
  }
  if (!reader.readIndexedMessageTimes) {
    return false;
  }

  let indexedMessages = 0;
  for await (const _entry of reader.readIndexedMessageTimes({
    limit: BOOTSTRAP_CHANNEL_MESSAGE_LIMIT,
    topics: [entry.channel.topic],
  })) {
    indexedMessages += 1;
    if (indexedMessages >= BOOTSTRAP_CHANNEL_MESSAGE_LIMIT) {
      return true;
    }
  }
  return false;
}

type BoundedFrameTransformChannelRead =
  | {
      readonly kind: "complete";
      readonly messages: readonly McapMessage[];
    }
  | { readonly kind: "deferred" }
  | { readonly kind: "fallback" };

async function readBoundedFrameTransformChannel(
  reader: McapIndexedReaderLike,
  entry: FrameTransformChannel,
): Promise<BoundedFrameTransformChannelRead> {
  const readBoundedMessages = reader.readBoundedMessages;
  if (!readBoundedMessages || reader.chunkIndexes.length === 0) {
    return { kind: "fallback" };
  }
  const chunks = chunksForChannel(reader, entry.channel.id);
  if (chunks.length === 0) {
    return entry.messageCount === undefined || entry.messageCount === 0n
      ? { kind: "complete", messages: [] }
      : { kind: "fallback" };
  }
  if (chunks.length > Number(BOOTSTRAP_CHANNEL_MESSAGE_CAP)) {
    return { kind: "deferred" };
  }

  const indexedSourceBytes = sumSafeChunkBytes(
    chunks,
    (chunk) => chunk.chunkLength + chunk.messageIndexLength,
  );
  const indexedUncompressedBytes = sumSafeChunkBytes(
    chunks,
    (chunk) => chunk.uncompressedSize,
  );
  if (
    indexedSourceBytes > BOOTSTRAP_BOUNDED_MAX_SOURCE_BYTES ||
    indexedUncompressedBytes > BOOTSTRAP_BOUNDED_MAX_UNCOMPRESSED_BYTES
  ) {
    return { kind: "fallback" };
  }

  const budget = {
    maxMessages: Number(BOOTSTRAP_CHANNEL_MESSAGE_CAP),
    maxSourceBytes: BOOTSTRAP_BOUNDED_MAX_SOURCE_BYTES,
    maxUncompressedBytes: BOOTSTRAP_BOUNDED_MAX_UNCOMPRESSED_BYTES,
    maxWallTimeMs: BOOTSTRAP_BOUNDED_MAX_WALL_TIME_MS,
  };
  const messages: McapMessage[] = [];
  let continuation: McapReadContinuation | undefined;
  for (let grant = 0; grant <= chunks.length; grant += 1) {
    const result: McapBoundedMessageReadResult = await readBoundedMessages({
      absoluteBudget: budget,
      absoluteMaxChunks: chunks.length,
      budget,
      ...(continuation ? { continuation } : {}),
      maxChunks: chunks.length,
      topics: [entry.channel.topic],
    });
    if (result.stopReason === "oversized-source-unit") {
      return { kind: "fallback" };
    }
    messages.push(...result.messages);
    if (messages.length > Number(BOOTSTRAP_CHANNEL_MESSAGE_CAP)) {
      return { kind: "deferred" };
    }
    if (!result.continuation) {
      return result.stopReason === "source-exhausted"
        ? { kind: "complete", messages }
        : { kind: "fallback" };
    }
    continuation = result.continuation;
  }

  return { kind: "fallback" };
}

function chunksForChannel(
  reader: McapIndexedReaderLike,
  channelId: number,
): readonly McapChunkIndex[] {
  return reader.chunkIndexes.filter((chunk: McapChunkIndex) =>
    chunk.messageIndexOffsets.has(channelId),
  );
}

function sumSafeChunkBytes(
  chunks: readonly McapChunkIndex[],
  select: (chunk: McapChunkIndex) => bigint,
): number {
  const total = chunks.reduce((sum, chunk) => sum + select(chunk), 0n);
  const value = Number(total);
  return Number.isSafeInteger(value) ? value : Number.POSITIVE_INFINITY;
}

function firstMessageHasStaticSample(
  entry: FrameTransformChannel,
  messages: readonly McapMessage[],
): boolean {
  const message = messages.find(
    (candidate) => candidate.channelId === entry.channel.id,
  );
  if (!message) {
    return false;
  }
  try {
    return normalizeFrameTransformMessage({ entry, message }).some(
      (sample) => sample.timeNs === undefined,
    );
  } catch {
    return false;
  }
}

async function firstTransformMessageHasStaticSample(
  reader: McapIndexedReaderLike,
  entry: FrameTransformChannel,
): Promise<boolean> {
  for await (const message of reader.readMessages({
    topics: [entry.channel.topic],
  })) {
    if (message.channelId !== entry.channel.id) {
      continue;
    }
    try {
      return normalizeFrameTransformMessage({
        entry,
        message,
      }).some((sample) => sample.timeNs === undefined);
    } catch {
      return false;
    }
  }

  return false;
}

function isStaticTransformBootstrapTopic(topic: string): boolean {
  const segments = topic
    .toLowerCase()
    .split(/[/.:-]+/)
    .filter(Boolean);
  if (
    segments.some((segment) => STATIC_TRANSFORM_TOPIC_SEGMENTS.has(segment))
  ) {
    return true;
  }

  return segments.some((segment, index) => {
    const nextSegment = segments[index + 1];
    return (
      (segment === "tf" && nextSegment === "static") ||
      (segment === "static" &&
        (nextSegment === "tf" ||
          nextSegment === "transform" ||
          nextSegment === "transforms"))
    );
  });
}

/**
 * Reads dynamic frame transforms in a playback timeline window from every
 * schema-discovered transform channel. Per-sample classification: a sample
 * with a message-level timestamp inside the requested window is dynamic;
 * a sample with no timestamp is emitted as static (no `timeNs`) so callers
 * can store it for all time, matching Foxglove convention. Indexed readers
 * also contribute the newest predecessor sample per edge so random seeks can
 * hold a recorded pose immediately; non-indexed readers retain predecessors
 * found inside the bounded message read.
 */
export async function readMcapFrameTransformWindow({
  predecessorStore,
  reader,
  readSignal,
  request,
  timeline,
}: {
  readonly predecessorStore?: McapPredecessorStore;
  readonly reader: McapIndexedReaderLike;
  readonly readSignal?: { readonly current: AbortSignal | null };
  readonly request: McapReadFrameTransformWindowRequest;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapFrameTransformSet> {
  // The worker replaces this mutable slot as newer reads supersede older ones.
  // Capture this operation's signal so a late AbortError is still recognized
  // after the slot has advanced to a fresh, non-aborted signal.
  const signal = readSignal?.current ?? undefined;
  try {
    return await readMcapFrameTransformWindowImpl({
      predecessorStore,
      reader,
      request,
      signal,
      timeline,
    });
  } catch (error) {
    if (
      signal?.aborted ||
      readSignal?.current?.aborted ||
      isEpisodeReadCancelledError(error)
    ) {
      throw new EpisodeReadCancelledError();
    }
    throw error;
  }
}

async function readMcapFrameTransformWindowImpl({
  predecessorStore,
  reader,
  request,
  signal,
  timeline,
}: {
  readonly predecessorStore?: McapPredecessorStore;
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadFrameTransformWindowRequest;
  readonly signal?: AbortSignal;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapFrameTransformSet> {
  const bootstrappedStaticChannelIds =
    bootstrappedStaticChannelIdsByReader.get(reader);
  const transformChannels = discoverFrameTransformChannels(reader).filter(
    (entry) => !bootstrappedStaticChannelIds?.has(entry.channel.id),
  );
  if (transformChannels.length === 0) {
    return createMcapFrameTransformSet({ samples: [] });
  }
  const channelsById = indexByChannelId(transformChannels);
  const readStats = createFrameTransformReadStats(
    transformChannels.map((entry) => entry.channel.topic),
  );
  const requiredDynamicChildFrameIds = [
    ...new Set(request.requiredDynamicChildFrameIds?.filter(Boolean) ?? []),
  ].sort();
  if (
    requiredDynamicChildFrameIds.length > 0 &&
    request.startTimeNs === request.endTimeNs
  ) {
    const placement = await readIndexedTransformPlacement({
      channelsById,
      reader,
      readStats,
      requiredDynamicChildFrameIds,
      signal,
      timeline,
      timeNs: request.startTimeNs,
      topics: transformChannels.map((entry) => entry.channel.topic),
    });
    return createMcapFrameTransformSet({
      placementCoverage: placement.coverage,
      readStats,
      samples: placement.samples,
    });
  }
  const { endTime, startTime } = timeline.messageReadRange({
    endTimeNs: request.endTimeNs,
    startTimeNs: request.startTimeNs,
  });

  const transformTopics = transformChannels.map((entry) => entry.channel.topic);

  const samples: McapFrameTransformSample[] = [];
  const inWindowPredecessorByEdge = new Map<string, McapFrameTransformSample>();
  const nextKnownTimeNsByTopic = new Map(
    transformTopics.map((topic) => [topic, request.endTimeNs + 1n] as const),
  );
  for await (const message of readFrameTransformWindowMessages({
    endTime,
    endTimeNs: request.endTimeNs,
    reader,
    signal,
    startTime,
    startTimeNs: request.startTimeNs,
    timeline,
    topics: transformTopics,
  })) {
    throwIfFrameTransformReadCancelled(signal);
    const entry = channelsById.get(message.channelId);
    if (!entry) {
      continue;
    }
    const messageTimeNs = timeline.messageTimeNs(message);
    if (messageTimeNs > request.startTimeNs) {
      const current = nextKnownTimeNsByTopic.get(entry.channel.topic);
      if (current === undefined || messageTimeNs < current) {
        nextKnownTimeNsByTopic.set(entry.channel.topic, messageTimeNs);
      }
    }
    recordFrameTransformMessage(readStats, entry.channel.topic, message);
    try {
      for (const sample of normalizeFrameTransformMessage({
        entry,
        message,
      })) {
        if (sample.timeNs === undefined) {
          samples.push(sample);
          continue;
        }
        if (sample.timeNs < request.startTimeNs) {
          setNewestFrameTransformSample(inWindowPredecessorByEdge, sample);
          continue;
        }
        if (sample.timeNs <= request.endTimeNs) {
          samples.push(sample);
        }
      }
    } catch {
      continue;
    }
  }

  const predecessorAnchors = await readIndexedTransformPredecessorAnchors({
    channelsById,
    nextKnownTimeNsByTopic,
    predecessorStore,
    reader,
    readStats,
    signal,
    timeline,
    timeNs: request.startTimeNs,
    topics: transformTopics,
  });
  const anchorsByEdge = new Map<string, McapFrameTransformSample>();
  for (const anchor of [
    ...predecessorAnchors,
    ...inWindowPredecessorByEdge.values(),
  ]) {
    setNewestFrameTransformSample(anchorsByEdge, anchor);
  }
  const sampleIdentities = new Set(samples.map(frameTransformSampleIdentity));
  for (const anchor of anchorsByEdge.values()) {
    const identity = frameTransformSampleIdentity(anchor);
    if (!sampleIdentities.has(identity)) {
      sampleIdentities.add(identity);
      samples.push(anchor);
    }
  }

  return createMcapFrameTransformSet({ readStats, samples });
}

interface IndexedTransformPlacementResult {
  readonly coverage: McapFrameTransformPlacementCoverage;
  readonly samples: readonly McapFrameTransformSample[];
}

/**
 * Resolves a bounded, contiguous predecessor tail until every dynamic child
 * already known by the runtime has an anchor. A partial tail is returned as
 * explicitly incomplete so callers can use their full-window fallback
 * without ever marking missing edges settled.
 */
async function readIndexedTransformPlacement({
  channelsById,
  reader,
  readStats,
  requiredDynamicChildFrameIds,
  signal,
  timeline,
  timeNs,
  topics,
}: {
  readonly channelsById: ReadonlyMap<number, FrameTransformChannel>;
  readonly reader: McapIndexedReaderLike;
  readonly readStats: FrameTransformReadStats;
  readonly requiredDynamicChildFrameIds: readonly string[];
  readonly signal?: AbortSignal;
  readonly timeline: McapTimelineStrategy;
  readonly timeNs: bigint;
  readonly topics: readonly string[];
}): Promise<IndexedTransformPlacementResult> {
  const indexedMessageTimeNs = timeline.indexedMessageTimeNs;
  const indexedMessageTimesRequest = timeline.indexedMessageTimesRequest;
  const readIndexedMessages = reader.readIndexedMessages?.bind(reader);
  const readLatestIndexedMessageTimes =
    reader.readLatestIndexedMessageTimes?.bind(reader);
  if (
    !indexedMessageTimeNs ||
    !indexedMessageTimesRequest ||
    !readIndexedMessages ||
    !readLatestIndexedMessageTimes
  ) {
    return { coverage: { complete: false }, samples: [] };
  }

  const probeTimeNs = indexedMessageTimesRequest({
    endTimeNs: timeNs,
  }).endTimeNs;
  if (probeTimeNs === undefined) {
    return { coverage: { complete: false }, samples: [] };
  }

  const requiredChildren = new Set(requiredDynamicChildFrameIds);
  const entriesByIdentity = new Map<string, McapIndexedMessageTime>();
  const samplesByIdentity = new Map<string, McapFrameTransformSample>();
  const newestEvidenceByChild = new Map<
    string,
    { readonly availableTimeNs: bigint; readonly sampleTimeNs: bigint }
  >();

  for (const limitPerTopic of TRANSFORM_PLACEMENT_PREDECESSOR_LIMITS) {
    throwIfFrameTransformReadCancelled(signal);
    const resolved = await readLatestIndexedMessageTimes({
      limitPerTopic,
      timeNs: probeTimeNs,
      topics,
    });
    throwIfFrameTransformReadCancelled(signal);

    const newEntries: McapIndexedMessageTime[] = [];
    for (const entries of resolved.values()) {
      for (const entry of entries) {
        const identity = indexedTransformEntryIdentity(entry);
        if (!entriesByIdentity.has(identity)) {
          entriesByIdentity.set(identity, entry);
          newEntries.push(entry);
        }
      }
    }
    if (newEntries.length === 0) {
      break;
    }

    void reader.prefetchChunkData?.({
      chunkStartOffsets: [
        ...new Set(newEntries.map((entry) => entry.chunkStartOffset)),
      ],
    });
    const messages = await readIndexedMessages({
      entries: newEntries,
      signal,
    });
    if (messages.length !== newEntries.length) {
      throw new Error(
        `MCAP indexed transform reader returned ${messages.length} messages for ${newEntries.length} placement entries`,
      );
    }

    for (let index = 0; index < messages.length; index += 1) {
      throwIfFrameTransformReadCancelled(signal);
      const message = messages[index];
      const entry = newEntries[index];
      if (!message || !entry) {
        continue;
      }
      const channel = channelsById.get(message.channelId);
      if (!channel) {
        continue;
      }
      recordFrameTransformMessage(readStats, channel.channel.topic, message);
      try {
        for (const sample of normalizeFrameTransformMessage({
          entry: channel,
          message,
        })) {
          if (sample.timeNs === undefined || sample.timeNs > timeNs) {
            continue;
          }
          samplesByIdentity.set(frameTransformSampleIdentity(sample), sample);
          if (!requiredChildren.has(sample.childFrameId)) {
            continue;
          }
          const current = newestEvidenceByChild.get(sample.childFrameId);
          if (current === undefined || current.sampleTimeNs < sample.timeNs) {
            newestEvidenceByChild.set(sample.childFrameId, {
              availableTimeNs: maxBigIntValues([
                indexedMessageTimeNs(entry),
                sample.timeNs,
              ]),
              sampleTimeNs: sample.timeNs,
            });
          }
        }
      } catch {
        continue;
      }
    }

    if (
      requiredDynamicChildFrameIds.every((childFrameId) =>
        newestEvidenceByChild.has(childFrameId),
      )
    ) {
      const coverageStartTimeNs = maxBigIntValues(
        requiredDynamicChildFrameIds.map(
          (childFrameId) =>
            newestEvidenceByChild.get(childFrameId)?.availableTimeNs ?? timeNs,
        ),
      );
      return {
        coverage: { complete: true, startTimeNs: coverageStartTimeNs },
        samples: [...samplesByIdentity.values()],
      };
    }
  }

  return {
    coverage: { complete: false },
    samples: [...samplesByIdentity.values()],
  };
}

function indexedTransformEntryIdentity(entry: McapIndexedMessageTime): string {
  return `${entry.chunkStartOffset}\0${entry.messageOffset}\0${entry.channelId}\0${entry.logTimeNs}`;
}

/**
 * Materializes transform records from exact MCAP message-index offsets when
 * the reader and active timeline support it. This uses the reader's stable,
 * source-keyed decompressed-chunk LRU, so adjacent placement windows do not
 * repeatedly decompress and CRC the same mixed chunks. Unsupported timelines
 * and readers retain the core indexed-reader path.
 */
async function* readFrameTransformWindowMessages({
  endTime,
  endTimeNs,
  reader,
  signal,
  startTime,
  startTimeNs,
  timeline,
  topics,
}: {
  readonly endTime: bigint | undefined;
  readonly endTimeNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly signal?: AbortSignal;
  readonly startTime: bigint | undefined;
  readonly startTimeNs: bigint;
  readonly timeline: McapTimelineStrategy;
  readonly topics: readonly string[];
}): AsyncGenerator<McapMessage, void, void> {
  const readIndexedMessages = reader.readIndexedMessages?.bind(reader);
  const readIndexedMessageTimes = reader.readIndexedMessageTimes?.bind(reader);
  const indexedMessageTimeNs = timeline.indexedMessageTimeNs;
  const indexedMessageTimesRequest = timeline.indexedMessageTimesRequest;
  if (
    readIndexedMessages &&
    readIndexedMessageTimes &&
    indexedMessageTimeNs &&
    indexedMessageTimesRequest
  ) {
    const indexedRequest = indexedMessageTimesRequest({
      endTimeNs,
      startTimeNs,
      topics,
    });

    // Message indexes are small. Await their bounded parallel prefetch so the
    // following index scan does not serialize one remote read per chunk/topic.
    await reader.prefetchWindow?.({
      endTimeNs: indexedRequest.endTimeNs,
      includeChunkData: false,
      startTimeNs: indexedRequest.startTimeNs,
      topics: indexedRequest.topics,
    });
    throwIfFrameTransformReadCancelled(signal);

    const entries: McapIndexedMessageTime[] = [];
    for await (const entry of readIndexedMessageTimes(indexedRequest)) {
      throwIfFrameTransformReadCancelled(signal);
      if (isWithinRange(indexedMessageTimeNs(entry), startTimeNs, endTimeNs)) {
        entries.push(entry);
      }
    }
    throwIfFrameTransformReadCancelled(signal);
    if (entries.length === 0) {
      return;
    }

    // Chunk-data prefetch is advisory and bounded by the byte layer. Keep it
    // concurrent with exact materialization, which processes one chunk at a
    // time and retains only the reader's bounded decompressed LRU.
    void reader.prefetchChunkData?.({
      chunkStartOffsets: [
        ...new Set(entries.map((entry) => entry.chunkStartOffset)),
      ],
    });
    const messages = await readIndexedMessages({ entries, signal });
    if (messages.length !== entries.length) {
      throw new Error(
        `MCAP indexed transform reader returned ${messages.length} messages for ${entries.length} entries`,
      );
    }
    for (const message of messages) {
      throwIfFrameTransformReadCancelled(signal);
      yield message;
    }
    return;
  }

  // The core reader is also message-index driven. Warm the relevant byte
  // ranges so its per-window chunk loads can overlap on remote transports.
  void reader.prefetchWindow?.({
    endTimeNs: endTime,
    startTimeNs: startTime,
    topics,
  });
  for await (const message of reader.readMessages({
    endTime,
    startTime,
    topics,
  })) {
    throwIfFrameTransformReadCancelled(signal);
    yield message;
  }
}

function throwIfFrameTransformReadCancelled(
  signal: AbortSignal | undefined,
): void {
  if (signal?.aborted) {
    throw new EpisodeReadCancelledError();
  }
}

/**
 * Resolves a bounded set of indexed messages before a random-seek window,
 * then keeps only the newest dynamic sample per transform edge. This gives
 * the runtime a truthful pose to hold without scanning transform history.
 */
async function readIndexedTransformPredecessorAnchors({
  channelsById,
  nextKnownTimeNsByTopic,
  predecessorStore,
  reader,
  readStats,
  signal,
  timeline,
  timeNs,
  topics,
}: {
  readonly channelsById: ReadonlyMap<number, FrameTransformChannel>;
  readonly nextKnownTimeNsByTopic: ReadonlyMap<string, bigint>;
  readonly predecessorStore?: McapPredecessorStore;
  readonly reader: McapIndexedReaderLike;
  readonly readStats: FrameTransformReadStats;
  readonly signal?: AbortSignal;
  readonly timeline: McapTimelineStrategy;
  readonly timeNs: bigint;
  readonly topics: readonly string[];
}): Promise<readonly McapFrameTransformSample[]> {
  const indexedMessageTimeNs = timeline.indexedMessageTimeNs;
  const indexedMessageTimesRequest = timeline.indexedMessageTimesRequest;
  if (
    !reader.readLatestIndexedMessageTimes ||
    !indexedMessageTimeNs ||
    !indexedMessageTimesRequest
  ) {
    return [];
  }

  const probeTimeNs = indexedMessageTimesRequest({
    endTimeNs: timeNs,
  }).endTimeNs;
  if (probeTimeNs === undefined) {
    return [];
  }

  const entriesByTopic = new Map<string, readonly McapIndexedMessageTime[]>();
  const topicsToProbe: string[] = [];
  for (const topic of topics) {
    const memoized = predecessorStore?.lookup(
      topic,
      timeNs,
      TRANSFORM_PREDECESSOR_MESSAGES_PER_TOPIC,
    );
    if (memoized) {
      entriesByTopic.set(topic, memoized);
      predecessorStore?.extend(
        topic,
        timeNs,
        nextKnownTimeNsByTopic.get(topic) ?? timeNs + 1n,
      );
    } else {
      topicsToProbe.push(topic);
    }
  }

  if (topicsToProbe.length > 0) {
    const resolved = await reader.readLatestIndexedMessageTimes({
      limitPerTopic: TRANSFORM_PREDECESSOR_MESSAGES_PER_TOPIC,
      timeNs: probeTimeNs,
      topics: topicsToProbe,
    });
    for (const topic of topicsToProbe) {
      const entries = resolved.get(topic) ?? [];
      entriesByTopic.set(topic, entries);
      const entryTimes = entries.map(indexedMessageTimeNs);
      predecessorStore?.record(topic, {
        entries,
        limitPerTopic: TRANSFORM_PREDECESSOR_MESSAGES_PER_TOPIC,
        nextKnownTimeNs: nextKnownTimeNsByTopic.get(topic) ?? timeNs + 1n,
        predecessorTimeNs:
          entryTimes.length > 0 ? maxBigIntValues(entryTimes) : null,
      });
    }
  }

  const entries = [...entriesByTopic.values()].flat();
  if (entries.length === 0) {
    return [];
  }
  void reader.prefetchChunkData?.({
    chunkStartOffsets: [
      ...new Set(entries.map((entry) => entry.chunkStartOffset)),
    ],
  });

  const newestSampleByEdge = new Map<string, McapFrameTransformSample>();
  const readIndexedMessages = reader.readIndexedMessages?.bind(reader);
  if (readIndexedMessages) {
    const messages = await readIndexedMessages({ entries, signal });
    if (messages.length !== entries.length) {
      throw new Error(
        `MCAP indexed transform reader returned ${messages.length} messages for ${entries.length} predecessor entries`,
      );
    }
    for (const message of messages) {
      throwIfFrameTransformReadCancelled(signal);
      recordNewestFrameTransformSamples({
        channelsById,
        message,
        newestSampleByEdge,
        readStats,
        timeNs,
      });
    }
    return [...newestSampleByEdge.values()].sort(
      compareFrameTransformSamplesByTime,
    );
  }

  for (const [topic, groupedEntries] of entriesByTopic) {
    throwIfFrameTransformReadCancelled(signal);
    if (groupedEntries.length === 0) {
      continue;
    }
    const timelineTimes = groupedEntries.map(indexedMessageTimeNs);
    const { endTime, startTime } = timeline.messageReadRange({
      endTimeNs: maxBigIntValues(timelineTimes),
      startTimeNs: minBigIntValues(timelineTimes),
    });
    const indexedIdentities = new Set(
      groupedEntries.map(indexedTransformMessageIdentity),
    );

    for await (const message of reader.readMessages({
      endTime,
      startTime,
      topics: [topic],
    })) {
      throwIfFrameTransformReadCancelled(signal);
      if (
        !indexedIdentities.has(
          `${message.channelId}\0${message.logTime.toString()}`,
        )
      ) {
        continue;
      }
      recordNewestFrameTransformSamples({
        channelsById,
        message,
        newestSampleByEdge,
        readStats,
        timeNs,
      });
    }
  }

  return [...newestSampleByEdge.values()].sort(
    compareFrameTransformSamplesByTime,
  );
}

function recordNewestFrameTransformSamples({
  channelsById,
  message,
  newestSampleByEdge,
  readStats,
  timeNs,
}: {
  readonly channelsById: ReadonlyMap<number, FrameTransformChannel>;
  readonly message: McapMessage;
  readonly newestSampleByEdge: Map<string, McapFrameTransformSample>;
  readonly readStats: FrameTransformReadStats;
  readonly timeNs: bigint;
}): void {
  const channel = channelsById.get(message.channelId);
  if (!channel) {
    return;
  }
  recordFrameTransformMessage(readStats, channel.channel.topic, message);
  try {
    for (const sample of normalizeFrameTransformMessage({
      entry: channel,
      message,
    })) {
      if (sample.timeNs === undefined || sample.timeNs > timeNs) {
        continue;
      }
      setNewestFrameTransformSample(newestSampleByEdge, sample);
    }
  } catch {
    return;
  }
}

function indexedTransformMessageIdentity(entry: McapIndexedMessageTime) {
  return `${entry.channelId}\0${entry.logTimeNs.toString()}`;
}

function frameTransformSampleIdentity(sample: McapFrameTransformSample) {
  return `${frameTransformEdgeKey(sample)}\0${sample.timeNs?.toString() ?? "static"}`;
}

function setNewestFrameTransformSample(
  samplesByEdge: Map<string, McapFrameTransformSample>,
  sample: McapFrameTransformSample,
) {
  if (sample.timeNs === undefined) {
    return;
  }
  const edgeKey = frameTransformEdgeKey(sample);
  const current = samplesByEdge.get(edgeKey);
  if (current?.timeNs === undefined || current.timeNs < sample.timeNs) {
    samplesByEdge.set(edgeKey, sample);
  }
}

function maxBigIntValues(values: readonly bigint[]) {
  let maximum = values[0] as bigint;
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] as bigint;
    if (value > maximum) {
      maximum = value;
    }
  }
  return maximum;
}

function minBigIntValues(values: readonly bigint[]) {
  let minimum = values[0] as bigint;
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] as bigint;
    if (value < minimum) {
      minimum = value;
    }
  }
  return minimum;
}

function createFrameTransformReadStats(
  topics: readonly string[],
): FrameTransformReadStats {
  return {
    encodedPayloadBytes: 0,
    messageCount: 0,
    topicStats: new Map(),
    topics,
  };
}

function recordFrameTransformMessage(
  stats: FrameTransformReadStats,
  topic: string,
  message: McapTypes.TypedMcapRecords["Message"],
): void {
  stats.encodedPayloadBytes += message.data.byteLength;
  stats.messageCount += 1;
  const topicStats = stats.topicStats.get(topic) ?? {
    encodedPayloadBytes: 0,
    messageCount: 0,
    topic,
  };
  stats.topicStats.set(topic, {
    ...topicStats,
    encodedPayloadBytes:
      topicStats.encodedPayloadBytes + message.data.byteLength,
    messageCount: topicStats.messageCount + 1,
  });
}

function indexByChannelId(entries: readonly FrameTransformChannel[]) {
  return new Map(entries.map((entry) => [entry.channel.id, entry]));
}

function normalizeFrameTransformMessage({
  entry,
  message,
}: {
  readonly entry: FrameTransformChannel;
  readonly message: McapMessage;
}): readonly McapFrameTransformSample[] {
  const record = entry.decodeRecord(message);
  const staticTopic = isStaticTransformBootstrapTopic(entry.channel.topic);

  if (entry.match.kind === "batch") {
    return requiredArray(record, entry.match.repeatedFieldName).map(
      (transform) =>
        normalizeFrameTransformRecord(asRecord(transform), {
          format: entry.match.format,
          staticTopic,
        }),
    );
  }

  return [
    normalizeFrameTransformRecord(record, {
      format: entry.match.format,
      staticTopic,
    }),
  ];
}

function normalizeFrameTransformRecord(
  record: Record<string, unknown>,
  {
    format,
    staticTopic,
  }: {
    readonly format: FrameTransformSchemaMatch["format"];
    readonly staticTopic: boolean;
  },
): McapFrameTransformSample {
  if (format === "ros-tf-message") {
    return normalizeRosTransformStampedRecord(record, staticTopic);
  }

  const parentFrameId = optionalString(
    record,
    "parentFrameId",
    "parent_frame_id",
  );
  const childFrameId = optionalString(record, "childFrameId", "child_frame_id");
  const translation = optionalRecord(record, "translation");
  const rotation = optionalRecord(record, "rotation");
  const transformTimeNs = timestampNs(optionalRecord(record, "timestamp"));

  if (!parentFrameId) {
    throw new Error("FrameTransform parent_frame_id is missing");
  }
  if (!childFrameId) {
    throw new Error("FrameTransform child_frame_id is missing");
  }
  if (!translation) {
    throw new Error("FrameTransform translation is missing");
  }
  if (!rotation) {
    throw new Error("FrameTransform rotation is missing");
  }

  return {
    childFrameId,
    parentFrameId,
    rotation: new Quaternion(
      requiredNumber(rotation, "x"),
      requiredNumber(rotation, "y"),
      requiredNumber(rotation, "z"),
      requiredNumber(rotation, "w"),
    ).normalize(),
    ...(transformTimeNs !== undefined ? { timeNs: transformTimeNs } : {}),
    translation: new Vector3(
      requiredNumber(translation, "x"),
      requiredNumber(translation, "y"),
      requiredNumber(translation, "z"),
    ),
  };
}

function normalizeRosTransformStampedRecord(
  record: Record<string, unknown>,
  staticTopic: boolean,
): McapFrameTransformSample {
  const header = optionalRecord(record, "header");
  const transform = optionalRecord(record, "transform");
  const parentFrameId = header
    ? optionalString(header, "frame_id", "frameId")
    : undefined;
  const childFrameId = optionalString(record, "child_frame_id", "childFrameId");
  const translation = transform
    ? optionalRecord(transform, "translation")
    : undefined;
  const rotation = transform
    ? optionalRecord(transform, "rotation")
    : undefined;
  const transformTimeNs = staticTopic
    ? undefined
    : rosTimestampNs(header ? optionalRecord(header, "stamp") : undefined);

  if (!parentFrameId) {
    throw new Error("TransformStamped header.frame_id is missing");
  }
  if (!childFrameId) {
    throw new Error("TransformStamped child_frame_id is missing");
  }
  if (!translation) {
    throw new Error("TransformStamped translation is missing");
  }
  if (!rotation) {
    throw new Error("TransformStamped rotation is missing");
  }

  return {
    childFrameId,
    parentFrameId,
    rotation: new Quaternion(
      requiredNumber(rotation, "x"),
      requiredNumber(rotation, "y"),
      requiredNumber(rotation, "z"),
      requiredNumber(rotation, "w"),
    ).normalize(),
    ...(transformTimeNs !== undefined ? { timeNs: transformTimeNs } : {}),
    translation: new Vector3(
      requiredNumber(translation, "x"),
      requiredNumber(translation, "y"),
      requiredNumber(translation, "z"),
    ),
  };
}

function rosTimestampNs(timestamp: Record<string, unknown> | undefined) {
  if (!timestamp) {
    return undefined;
  }

  const seconds =
    optionalBigInt(timestamp, "sec") ??
    optionalBigInt(timestamp, "seconds") ??
    0n;
  const nanos =
    optionalBigInt(timestamp, "nsec") ??
    optionalBigInt(timestamp, "nanosec") ??
    optionalBigInt(timestamp, "nanos") ??
    0n;

  return seconds * 1_000_000_000n + nanos;
}

function classifyProtobufFrameTransformSchema(
  schema: McapSchema,
): FrameTransformSchemaMatch | null {
  if (schema.encoding !== PROTOBUF_ENCODING) {
    return null;
  }

  if (schema.name === FOXGLOVE_FRAME_TRANSFORMS_SCHEMA) {
    return {
      format: "foxglove",
      kind: "batch",
      repeatedFieldName: "transforms",
    };
  }
  if (SUPPORTED_TRANSFORM_SCHEMAS.has(schema.name)) {
    return {
      format: "foxglove",
      kind: "single",
    };
  }

  try {
    const root = protobufFromBinaryDescriptor(schema.data);
    const type = root.lookupType(schema.name);
    type.resolveAll();
    if (isFrameTransformType(type)) {
      return {
        format: "foxglove",
        kind: "single",
      };
    }

    const repeatedTransformField = type.fieldsArray.find(
      (field) =>
        field.repeated &&
        field.resolvedType &&
        isFrameTransformType(field.resolvedType as Type),
    );
    if (repeatedTransformField) {
      return {
        format: "foxglove",
        kind: "batch",
        repeatedFieldName: repeatedTransformField.name,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function classifyRosFrameTransformSchema(
  reader: McapIndexedReaderLike,
  channel: McapChannel,
  schema: McapSchema,
): FrameTransformSchemaMatch | null {
  const definitions = rosMessageDefinitionsForChannel(reader, channel);
  const root = definitions ? rootRosMessageDefinition(definitions) : undefined;
  if (!root) {
    return null;
  }

  if (isFoxgloveCdrFrameTransformSchema(schema, root)) {
    return {
      format: "foxglove",
      kind: "single",
    };
  }

  if (isFoxgloveCdrFrameTransformsSchema(schema, root)) {
    return {
      format: "foxglove",
      kind: "batch",
      repeatedFieldName: "transforms",
    };
  }

  if (!isRosTfMessageSchema(schema, root)) {
    return null;
  }

  const transformsField = root.definitions.find(
    (field) => field.name === TF_MESSAGE_BATCH_FIELD,
  );
  if (
    !transformsField?.isArray ||
    !transformsField.isComplex ||
    !ROS_TRANSFORM_STAMPED_SCHEMAS.has(transformsField.type)
  ) {
    return null;
  }

  return {
    format: "ros-tf-message",
    kind: "batch",
    repeatedFieldName: TF_MESSAGE_BATCH_FIELD,
  };
}

function isRosTfMessageSchema(
  schema: McapSchema,
  definition: RosMessageDefinition,
): boolean {
  return (
    ROS_TF_MESSAGE_SCHEMAS.has(schema.name) ||
    (definition.name !== undefined &&
      ROS_TF_MESSAGE_SCHEMAS.has(definition.name))
  );
}

function isFoxgloveCdrFrameTransformSchema(
  schema: McapSchema,
  definition: RosMessageDefinition,
): boolean {
  return (
    FOXGLOVE_CDR_TRANSFORM_SCHEMAS.has(schema.name) ||
    (definition.name !== undefined &&
      FOXGLOVE_CDR_TRANSFORM_SCHEMAS.has(definition.name))
  );
}

function isFoxgloveCdrFrameTransformsSchema(
  schema: McapSchema,
  definition: RosMessageDefinition,
): boolean {
  return (
    FOXGLOVE_CDR_TRANSFORMS_SCHEMAS.has(schema.name) ||
    (definition.name !== undefined &&
      FOXGLOVE_CDR_TRANSFORMS_SCHEMAS.has(definition.name))
  );
}

function isFrameTransformType(type: Type): boolean {
  const parentField = fieldByName(type, "parentFrameId", "parent_frame_id");
  const childField = fieldByName(type, "childFrameId", "child_frame_id");
  const translationField = fieldByName(type, "translation");
  const rotationField = fieldByName(type, "rotation");

  return (
    parentField?.type === "string" &&
    childField?.type === "string" &&
    isVector3Type(translationField?.resolvedType as Type | null | undefined) &&
    isQuaternionType(rotationField?.resolvedType as Type | null | undefined)
  );
}

function isVector3Type(type: Type | null | undefined): boolean {
  return Boolean(
    type &&
    numericField(type, "x") &&
    numericField(type, "y") &&
    numericField(type, "z"),
  );
}

function isQuaternionType(type: Type | null | undefined): boolean {
  return Boolean(
    type &&
    numericField(type, "x") &&
    numericField(type, "y") &&
    numericField(type, "z") &&
    numericField(type, "w"),
  );
}

function numericField(type: Type, name: string): boolean {
  const field = fieldByName(type, name);
  return field?.type === "double" || field?.type === "float";
}

function fieldByName(type: Type, ...names: string[]) {
  for (const name of names) {
    const field = type.fields[name];
    if (field) {
      return field;
    }
  }

  return undefined;
}

function createMcapFrameTransformSet({
  placementCoverage,
  readStats,
  samples,
}: {
  readonly placementCoverage?: McapFrameTransformPlacementCoverage;
  readonly readStats?: FrameTransformReadStats;
  readonly samples: readonly McapFrameTransformSample[];
}): McapFrameTransformSet {
  const sortedSamples = [...samples].sort(compareFrameTransformSamples);

  return {
    ...(readStats?.messageCount
      ? {
          encodedPayloadBytes: readStats.encodedPayloadBytes,
          messageCount: readStats.messageCount,
          topicStats: [...readStats.topicStats.values()],
          topics: readStats.topics,
        }
      : {}),
    ...(placementCoverage ? { placementCoverage } : {}),
    samples: sortedSamples,
  };
}

function compareFrameTransformSamples(
  left: McapFrameTransformSample,
  right: McapFrameTransformSample,
) {
  const edgeOrder = frameTransformEdgeKey(left).localeCompare(
    frameTransformEdgeKey(right),
  );
  if (edgeOrder !== 0) {
    return edgeOrder;
  }

  return compareFrameTransformSamplesByTime(left, right);
}
