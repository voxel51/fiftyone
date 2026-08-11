import type { McapTypes } from "@mcap/core";
import {
  EpisodeReadCancelledError,
  isEpisodeReadCancelledError,
} from "../../../../ports/index";
import {
  materializeIndexedEntries,
  type McapBoundedMessageReadResult,
  type McapIndexedMessageTime,
  type McapIndexedReaderLike,
  type McapReadContinuation,
} from "../../reader/index";
import type { McapTimelineStrategy } from "../timeline";
import type { McapPredecessorStore } from "../predecessor-store";
import { resolveIndexedPredecessorRound } from "../indexed-predecessor-probe";
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
import { maxBigInt, minBigInt } from "../../../../utils/bigint";
import { throwIfAborted } from "../../../../utils/cancellation";
import {
  discoverFrameTransformChannels,
  isStaticFrameTransformChannel,
  isStaticTransformBootstrapTopic,
  normalizeFrameTransformMessage,
  type FrameTransformChannel,
} from "./frame-transform-candidates";

const TRANSFORM_PREDECESSOR_MESSAGES_PER_TOPIC = 32;
const TRANSFORM_PLACEMENT_PREDECESSOR_LIMITS = [32, 128] as const;
const BOOTSTRAP_BOUNDED_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const BOOTSTRAP_BOUNDED_MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const BOOTSTRAP_BOUNDED_MAX_WALL_TIME_MS = 10_000;

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
// Legacy readMessages() limits bound yielded decode/retention work only. The
// underlying indexed reader may still load a larger mixed chunk before yield.
const BOOTSTRAP_FALLBACK_MAX_MESSAGES = 1_024;
const BOOTSTRAP_FALLBACK_MAX_ENCODED_BYTES = 64 * 1024 * 1024;
const FRAME_TRANSFORM_BOOTSTRAP_ABORT_MESSAGE =
  "MCAP frame transform bootstrap aborted";
type McapChunkIndex = McapTypes.TypedMcapRecords["ChunkIndex"];
type McapMessage = McapTypes.TypedMcapRecords["Message"];

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
 * Reads eager static frame transforms by schema discovery. A channel is
 * scanned in bootstrap only if it is below the bootstrap cap and either has a
 * known static-transform topic convention or an ambiguous first decoded sample
 * with no timestamp. This keeps bootstrap off broad dynamic transform channels.
 * A sample is emitted as static when the decoded transform message has no
 * `timestamp` (Foxglove convention for "always valid").
 */
export async function readMcapFrameTransformBootstrap(
  reader: McapIndexedReaderLike,
  signal?: AbortSignal,
): Promise<McapFrameTransformSet> {
  throwIfAborted(signal, FRAME_TRANSFORM_BOOTSTRAP_ABORT_MESSAGE);
  const boundedMessages: McapMessage[] = [];
  const completedStaticChannelIds = new Set<number>();
  const windowedSampleChannelIds = new Set<number>();
  const fallbackChannels: FrameTransformChannel[] = [];
  const bootstrapChannelsById = new Map<number, FrameTransformChannel>();
  // Admission stays per-channel so a missing footer count cannot hide one
  // broad topic inside an otherwise small aggregate read budget.
  for (const entry of discoverFrameTransformChannels(reader)) {
    throwIfAborted(signal, FRAME_TRANSFORM_BOOTSTRAP_ABORT_MESSAGE);
    if (await frameTransformChannelExceedsBootstrapCap(reader, entry, signal)) {
      continue;
    }

    const bounded = await readBoundedFrameTransformChannel(
      reader,
      entry,
      signal,
    );
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
    if (await firstTransformMessageHasStaticSample(reader, entry, signal)) {
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
    const fallbackMessageLimit = Math.min(
      BOOTSTRAP_FALLBACK_MAX_MESSAGES,
      Number(BOOTSTRAP_CHANNEL_MESSAGE_CAP) * fallbackChannels.length,
    );
    let fallbackEncodedBytes = 0;
    let fallbackMessages = 0;
    let fallbackReadComplete = true;
    for await (const message of reader.readMessages({
      topics: [
        ...new Set(fallbackChannels.map((entry) => entry.channel.topic)),
      ],
    })) {
      throwIfAborted(signal, FRAME_TRANSFORM_BOOTSTRAP_ABORT_MESSAGE);
      if (
        fallbackMessages >= fallbackMessageLimit ||
        fallbackEncodedBytes + message.data.byteLength >
          BOOTSTRAP_FALLBACK_MAX_ENCODED_BYTES
      ) {
        fallbackReadComplete = false;
        break;
      }
      fallbackMessages += 1;
      fallbackEncodedBytes += message.data.byteLength;
      recordBootstrapMessage({
        channelsById,
        message,
        readStats,
        samples,
        windowedSampleChannelIds,
      });
    }
    if (fallbackReadComplete) {
      for (const entry of fallbackChannels) {
        if (isStaticFrameTransformChannel(entry)) {
          completedStaticChannelIds.add(entry.channel.id);
        }
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
  signal?: AbortSignal,
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
    ...(signal ? { signal } : {}),
    topics: [entry.channel.topic],
  })) {
    throwIfAborted(signal, FRAME_TRANSFORM_BOOTSTRAP_ABORT_MESSAGE);
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
  signal?: AbortSignal,
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
    throwIfAborted(signal, FRAME_TRANSFORM_BOOTSTRAP_ABORT_MESSAGE);
    const result: McapBoundedMessageReadResult = await readBoundedMessages({
      absoluteBudget: budget,
      absoluteMaxChunks: chunks.length,
      budget,
      ...(continuation ? { continuation } : {}),
      maxChunks: chunks.length,
      signal,
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
    return normalizeFrameTransformMessage({
      entry: { ...entry, messageCount: undefined },
      message,
    }).some((sample) => sample.timeNs === undefined);
  } catch {
    return false;
  }
}

async function firstTransformMessageHasStaticSample(
  reader: McapIndexedReaderLike,
  entry: FrameTransformChannel,
  signal?: AbortSignal,
): Promise<boolean> {
  let encodedBytes = 0;
  let messages = 0;
  for await (const message of reader.readMessages({
    topics: [entry.channel.topic],
  })) {
    throwIfAborted(signal, FRAME_TRANSFORM_BOOTSTRAP_ABORT_MESSAGE);
    if (
      messages >= BOOTSTRAP_CHANNEL_MESSAGE_LIMIT ||
      encodedBytes + message.data.byteLength >
        BOOTSTRAP_FALLBACK_MAX_ENCODED_BYTES
    ) {
      return false;
    }
    messages += 1;
    encodedBytes += message.data.byteLength;
    if (message.channelId !== entry.channel.id) {
      continue;
    }
    try {
      return normalizeFrameTransformMessage({
        entry: { ...entry, messageCount: undefined },
        message,
      }).some((sample) => sample.timeNs === undefined);
    } catch {
      return false;
    }
  }

  return false;
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
      predecessorStore,
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
        treatSingleMessageChannelAsStatic: false,
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
  predecessorStore,
  reader,
  readStats,
  requiredDynamicChildFrameIds,
  signal,
  timeline,
  timeNs,
  topics,
}: {
  readonly channelsById: ReadonlyMap<number, FrameTransformChannel>;
  readonly predecessorStore?: McapPredecessorStore;
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
  const newestEvidenceTimeNsByChild = new Map<string, bigint>();
  const uniqueTopics = [...new Set(topics)].sort();

  for (const limitPerTopic of TRANSFORM_PLACEMENT_PREDECESSOR_LIMITS) {
    throwIfFrameTransformReadCancelled(signal);
    const resolved = await resolveIndexedPredecessorRound({
      indexedMessageTimeNs,
      limitPerTopic,
      nextKnownTimeNs: () => timeNs + 1n,
      predecessorStore,
      probeTimeNs,
      reader,
      throwIfCancelled: () => throwIfFrameTransformReadCancelled(signal),
      timeNs,
      topics,
    });
    throwIfFrameTransformReadCancelled(signal);

    const newEntries: McapIndexedMessageTime[] = [];
    for (const entries of resolved.entriesByTopic.values()) {
      for (const entry of entries) {
        const identity = indexedTransformEntryIdentity(entry);
        if (!entriesByIdentity.has(identity)) {
          entriesByIdentity.set(identity, entry);
          newEntries.push(entry);
        }
      }
    }
    const everyTopicExhausted = resolved.everyTopicExhausted;
    const completeResult = (): IndexedTransformPlacementResult => {
      // The runtime store's indexed ranges are global, not scoped to the
      // requested placement. Bound coverage by the oldest entry materialized
      // from every transform topic in this probe round.
      const topicFloors = uniqueTopics.flatMap((topic) => {
        const entries = resolved.entriesByTopic.get(topic) ?? [];
        return entries.length === 0
          ? []
          : [minBigInt(entries.map(indexedMessageTimeNs))];
      });
      return topicFloors.length === 0
        ? { coverage: { complete: false }, samples: [] }
        : {
            coverage: {
              complete: true,
              startTimeNs: maxBigInt(topicFloors),
            },
            samples: [...samplesByIdentity.values()],
          };
    };
    if (newEntries.length === 0) {
      if (everyTopicExhausted) return completeResult();
      break;
    }

    const messages = await materializeIndexedEntries(
      reader,
      newEntries,
      signal,
    );

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
          treatSingleMessageChannelAsStatic: false,
        })) {
          if (sample.timeNs === undefined || sample.timeNs > timeNs) {
            continue;
          }
          samplesByIdentity.set(frameTransformSampleIdentity(sample), sample);
          if (!requiredChildren.has(sample.childFrameId)) {
            continue;
          }
          const current = newestEvidenceTimeNsByChild.get(sample.childFrameId);
          if (current === undefined || current < sample.timeNs) {
            newestEvidenceTimeNsByChild.set(sample.childFrameId, sample.timeNs);
          }
        }
      } catch {
        continue;
      }
    }

    if (
      requiredDynamicChildFrameIds.every((childFrameId) =>
        newestEvidenceTimeNsByChild.has(childFrameId),
      )
    ) {
      return completeResult();
    }

    if (
      everyTopicExhausted &&
      limitPerTopic ===
        TRANSFORM_PLACEMENT_PREDECESSOR_LIMITS[
          TRANSFORM_PLACEMENT_PREDECESSOR_LIMITS.length - 1
        ]
    ) {
      // The newest-N query returned every predecessor on every transform
      // topic. Missing requested children are therefore proven absent at this
      // time, not an invitation to repeat the same work through a window read.
      return completeResult();
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

    const messages = await materializeIndexedEntries(reader, entries, signal);
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

  const { entriesByTopic } = await resolveIndexedPredecessorRound({
    extendFromTimeNs: timeNs,
    indexedMessageTimeNs,
    limitPerTopic: TRANSFORM_PREDECESSOR_MESSAGES_PER_TOPIC,
    nextKnownTimeNs: (topic) =>
      nextKnownTimeNsByTopic.get(topic) ?? timeNs + 1n,
    predecessorStore,
    probeTimeNs,
    reader,
    throwIfCancelled: () => throwIfFrameTransformReadCancelled(signal),
    timeNs,
    topics,
  });

  const entries = [...entriesByTopic.values()].flat();
  if (entries.length === 0) {
    return [];
  }
  const newestSampleByEdge = new Map<string, McapFrameTransformSample>();
  const readIndexedMessages = reader.readIndexedMessages?.bind(reader);
  if (readIndexedMessages) {
    const messages = await materializeIndexedEntries(reader, entries, signal);
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
      endTimeNs: maxBigInt(timelineTimes),
      startTimeNs: minBigInt(timelineTimes),
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
      treatSingleMessageChannelAsStatic: false,
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
