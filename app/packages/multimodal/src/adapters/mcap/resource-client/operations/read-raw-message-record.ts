import type { McapTypes } from "@mcap/core";
import {
  materializeIndexedEntries,
  type McapIndexedMessageTime,
  type McapIndexedReaderLike,
} from "../../reader/index";
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapRawMessageRecordResult,
  McapReadRawMessageRecordRequest,
} from "../../contracts/index";
import {
  genericRecordDecoderResolutionForChannel,
  mcapChannelForTopic,
} from "../generic-record-decoder";
import { pruneRawRecord, rawRecordToJsonText } from "../raw-record-prune";
import { errorMessage } from "../../../../utils/errors";
import {
  createAbortError,
  throwIfAborted,
} from "../../../../utils/cancellation";
import { EpisodeReadUnsupportedError } from "../../../../ports";
import { monotonicNowMs } from "../../../../utils/monotonic-time";

/**
 * Forward index probe horizon for the result's validity window. Absence
 * of a next message within it yields `validUntilNs` at the horizon — a
 * safe lower bound; the caller's next request past it re-selects the
 * same message and probes the next horizon.
 */
const VALIDITY_PROBE_HORIZON_NS = 60_000_000_000n;

/** Messages admitted by one non-indexed raw-record predecessor scan. */
export const RAW_RECORD_FALLBACK_MAX_MESSAGES = 1_024;

/** Encoded payload bytes admitted by one non-indexed raw-record scan. */
export const RAW_RECORD_FALLBACK_MAX_ENCODED_BYTES = 64 * 1024 * 1024;

/** Indexed chunks admitted by one raw-record read. */
export const RAW_RECORD_MAX_CHUNKS = 256;

/** Physical chunk bytes admitted by one raw-record read. */
export const RAW_RECORD_MAX_SOURCE_BYTES = 64 * 1024 * 1024;

/** Uncompressed chunk bytes admitted by one raw-record read. */
export const RAW_RECORD_MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;

/** Wall time admitted by one raw-record call. */
export const RAW_RECORD_MAX_WALL_TIME_MS = 10_000;

/** Same-timestamp candidates admitted for one indexed predecessor entry. */
export const RAW_RECORD_INDEXED_CANDIDATE_MAX_MESSAGES = 256;

/** Encoded bytes admitted for the single raw message selected for decoding. */
export const RAW_RECORD_MAX_MESSAGE_BYTES = 64 * 1024 * 1024;

export function assertRawRecordMessageInputBound(byteLength: number): void {
  if (byteLength <= RAW_RECORD_MAX_MESSAGE_BYTES) return;
  throw new EpisodeReadUnsupportedError(
    "raw-record-message",
    `Raw record payload exceeds the ${RAW_RECORD_MAX_MESSAGE_BYTES}-byte per-message input bound`,
  );
}

export function assertRawRecordFallbackWorkBound(
  messageCount: number,
  encodedBytes: number,
  elapsedMs = 0,
): void {
  if (
    messageCount <= RAW_RECORD_FALLBACK_MAX_MESSAGES &&
    encodedBytes <= RAW_RECORD_FALLBACK_MAX_ENCODED_BYTES &&
    elapsedMs <= RAW_RECORD_MAX_WALL_TIME_MS
  ) {
    return;
  }
  throw new EpisodeReadUnsupportedError(
    "raw-record-fallback",
    `Non-indexed raw lookup exceeded its per-read bound (${RAW_RECORD_FALLBACK_MAX_MESSAGES} messages, ${RAW_RECORD_FALLBACK_MAX_ENCODED_BYTES} encoded bytes, or ${RAW_RECORD_MAX_WALL_TIME_MS} ms)`,
  );
}

export function assertRawRecordSourceWorkBound(
  chunkCount: number,
  sourceBytes: bigint,
  uncompressedBytes: bigint,
): void {
  if (
    chunkCount <= RAW_RECORD_MAX_CHUNKS &&
    sourceBytes <= BigInt(RAW_RECORD_MAX_SOURCE_BYTES) &&
    uncompressedBytes <= BigInt(RAW_RECORD_MAX_UNCOMPRESSED_BYTES)
  ) {
    return;
  }
  throw new EpisodeReadUnsupportedError(
    "raw-record-source-work",
    `Raw lookup exceeded its per-read indexed-source bound (${RAW_RECORD_MAX_CHUNKS} chunks, ${RAW_RECORD_MAX_SOURCE_BYTES} source bytes, or ${RAW_RECORD_MAX_UNCOMPRESSED_BYTES} uncompressed bytes)`,
  );
}

export function assertRawRecordIndexedCandidateBound(
  candidateCount: number,
): void {
  if (candidateCount <= RAW_RECORD_INDEXED_CANDIDATE_MAX_MESSAGES) return;
  throw new EpisodeReadUnsupportedError(
    "raw-record-indexed-candidates",
    `Indexed raw lookup exceeded ${RAW_RECORD_INDEXED_CANDIDATE_MAX_MESSAGES} same-timestamp candidates`,
  );
}

/** Conservative non-indexed validity: never spans an unobserved successor. */
const FALLBACK_VALIDITY_STEP_NS = 1n;

type McapRawMessage = McapTypes.TypedMcapRecords["Message"];

function channelForRawRequest(
  reader: McapIndexedReaderLike,
  request: Pick<McapReadRawMessageRecordRequest, "channelId" | "topic">,
): McapTypes.TypedMcapRecords["Channel"] {
  if (request.channelId === undefined) {
    return mcapChannelForTopic(reader, request.topic);
  }
  const channel = reader.channelsById.get(request.channelId);
  if (!channel || channel.topic !== request.topic) {
    throw new Error(
      `MCAP channel ${request.channelId} does not match topic '${request.topic}'`,
    );
  }
  return channel;
}

/**
 * Reads the newest message at or before a playback time on one topic
 * and returns its schema-shaped record, pruned to bounded size.
 * Decoding is generic (protobuf descriptor / JSON / ROS schema readers)
 * and independent of the visualization decoder registry; channels without
 * a usable generic decode path degrade to metadata-only results instead
 * of failing.
 */
export async function readMcapRawMessageRecord({
  reader,
  request,
  signal,
  timeline,
}: {
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadRawMessageRecordRequest;
  readonly signal?: AbortSignal;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapRawMessageRecordResult> {
  throwIfAborted(signal);
  const topicChannel = channelForRawRequest(reader, request);
  const topicSchema = reader.schemasById.get(topicChannel.schemaId);
  const base = {
    messageEncoding: topicChannel.messageEncoding,
    schemaName: topicSchema?.name ?? null,
    topic: topicChannel.topic,
  };

  const message = await selectMessageAtOrBefore({
    reader,
    timeline,
    timeNs: request.timeNs,
    topic: topicChannel.topic,
    channelId: topicChannel.id,
    signal,
  });

  if (!message) {
    return {
      ...base,
      status: "empty",
      validFromNs: 0n,
      validUntilNs: await probeNextMessageTimeNs({
        afterNs: request.timeNs,
        fallbackNs: request.timeNs + FALLBACK_VALIDITY_STEP_NS,
        reader,
        timeline,
        topic: topicChannel.topic,
        channelId: topicChannel.id,
        signal,
      }),
    };
  }

  const messageTimeNs = timeline.messageTimeNs(message);
  assertRawRecordMessageInputBound(message.data.byteLength);
  const validUntilNs = await probeNextMessageTimeNs({
    afterNs: messageTimeNs,
    fallbackNs: request.timeNs + FALLBACK_VALIDITY_STEP_NS,
    reader,
    timeline,
    topic: topicChannel.topic,
    channelId: topicChannel.id,
    signal,
  });

  // Decode with the selected message's own channel: a topic can span
  // multiple channels with different schemas.
  const channel = reader.channelsById.get(message.channelId) ?? topicChannel;
  const schema = reader.schemasById.get(channel.schemaId);
  const metadata = {
    ...base,
    encodedPayloadBytes: message.data.byteLength,
    logTimeNs: message.logTime,
    messageEncoding: channel.messageEncoding,
    publishTimeNs: message.publishTime,
    schemaName: schema?.name ?? base.schemaName,
    sequence: message.sequence,
    validFromNs: messageTimeNs,
    validUntilNs,
  };

  const decoderResolution = genericRecordDecoderResolutionForChannel(
    reader,
    channel,
  );
  if (decoderResolution.status === "unavailable") {
    return {
      ...metadata,
      decodeUnavailableReason: decoderResolution.reason,
      status: "unsupported",
    };
  }

  let record: Record<string, unknown>;
  try {
    record = decoderResolution.decodeRecord(message.data);
  } catch (error) {
    return {
      ...metadata,
      decodeError: errorMessage(error),
      status: "decode-error",
    };
  }

  const pruned = pruneRawRecord(record, request.prune);
  return {
    ...metadata,
    fullJson: request.includeFullJson ? rawRecordToJsonText(record) : undefined,
    root: pruned.root,
    status: "ok",
    truncated: pruned.truncated || undefined,
  };
}

/**
 * Newest message at or before the requested time. Prefers the
 * index-only predecessor walk (unbounded lookback, no chunk decodes off
 * the selected path); readers without indexes fall back to a bounded
 * message scan.
 */
async function selectMessageAtOrBefore({
  channelId,
  reader,
  timeline,
  timeNs,
  topic,
  signal,
}: {
  readonly channelId: number;
  readonly reader: McapIndexedReaderLike;
  readonly timeline: McapTimelineStrategy;
  readonly timeNs: bigint;
  readonly topic: string;
  readonly signal?: AbortSignal;
}): Promise<McapRawMessage | null> {
  throwIfAborted(signal);
  const indexedMessageTimesRequest = timeline.indexedMessageTimesRequest;
  if (reader.readLatestIndexedMessageTimes && indexedMessageTimesRequest) {
    const probeBoundNs = indexedMessageTimesRequest({
      endTimeNs: timeNs,
    }).endTimeNs;
    if (probeBoundNs !== undefined) {
      const latestByTopic = await reader.readLatestIndexedMessageTimes({
        channelIds: [channelId],
        limitPerTopic: RAW_RECORD_INDEXED_CANDIDATE_MAX_MESSAGES + 1,
        timeNs: probeBoundNs,
        topics: [topic],
      });
      throwIfAborted(signal);
      const indexedEntries = latestByTopic.get(topic) ?? [];
      const latestLogTimeNs = indexedEntries.reduce<bigint | null>(
        (latest, entry) =>
          latest === null || entry.logTimeNs > latest
            ? entry.logTimeNs
            : latest,
        null,
      );
      if (latestLogTimeNs === null) {
        return null;
      }
      const candidates = indexedEntries.filter(
        (entry) =>
          entry.channelId === channelId && entry.logTimeNs === latestLogTimeNs,
      );
      assertRawRecordIndexedCandidateBound(candidates.length);
      const candidateChunkOffsets = new Set(
        candidates.map((entry) => entry.chunkStartOffset),
      );

      assertRawRecordChunksWithinBound(reader.chunkIndexes, (chunk) =>
        candidateChunkOffsets.has(chunk.chunkStartOffset),
      );
      return readMessageForIndexedEntries({
        candidates,
        channelId,
        reader,
        signal,
        topic,
      });
    }
  }

  // Non-indexed fallback: scan from the beginning so sparse/one-shot streams
  // preserve latest-at-or-before semantics. Message/byte/chunk/wall bounds
  // remain authoritative; exceeding one is an honest unsupported outcome,
  // never a false empty result. A start-time filter often cannot save physical
  // I/O on a non-indexed reader anyway.
  const { endTime, startTime } = timeline.messageReadRange({
    endTimeNs: timeNs,
    startTimeNs: 0n,
  });
  let newest: McapRawMessage | null = null;
  let messageCount = 0;
  let encodedBytes = 0;
  const fallbackStartedAtMs = monotonicNowMs();
  assertRawRecordChunksWithinBound(
    reader.chunkIndexes,
    (chunk) =>
      (startTime === undefined || chunk.messageEndTime >= startTime) &&
      (endTime === undefined || chunk.messageStartTime <= endTime),
  );
  const iterator = reader
    .readMessages({
      endTime,
      startTime,
      topics: [topic],
    })
    [Symbol.asyncIterator]();
  try {
    let next = await nextRawFallbackMessage(
      iterator,
      signal,
      fallbackStartedAtMs + RAW_RECORD_MAX_WALL_TIME_MS,
    );
    while (!next.done) {
      const message = next.value;
      throwIfAborted(signal);
      messageCount += 1;
      encodedBytes += message.data.byteLength;
      assertRawRecordFallbackWorkBound(
        messageCount,
        encodedBytes,
        monotonicNowMs() - fallbackStartedAtMs,
      );
      // Re-check the bound: fakes (and some readers) over-yield.
      if (
        message.channelId === channelId &&
        timeline.messageTimeNs(message) <= timeNs
      ) {
        if (!newest || isPreferredRawMessage(message, newest, timeline)) {
          newest = message;
        }
      }
      next = await nextRawFallbackMessage(
        iterator,
        signal,
        fallbackStartedAtMs + RAW_RECORD_MAX_WALL_TIME_MS,
      );
    }
  } finally {
    const returned = iterator.return?.();
    if (returned) void returned.catch(() => undefined);
  }

  return newest;
}

function nextRawFallbackMessage(
  iterator: AsyncIterator<McapRawMessage>,
  signal: AbortSignal | undefined,
  deadlineAtMs: number,
): Promise<IteratorResult<McapRawMessage>> {
  throwIfAborted(signal);
  const remainingMs = deadlineAtMs - monotonicNowMs();
  if (remainingMs <= 0) return Promise.reject(rawRecordWallTimeError());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () =>
      finish(() => reject(createAbortError("MCAP raw lookup aborted")));
    const timeout = setTimeout(
      () => finish(() => reject(rawRecordWallTimeError())),
      remainingMs,
    );
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    if (settled) return;
    void iterator.next().then(
      (next) => finish(() => resolve(next)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

export function rawRecordWallTimeError(): EpisodeReadUnsupportedError {
  return new EpisodeReadUnsupportedError(
    "raw-record-wall-time",
    `Raw lookup exceeded its ${RAW_RECORD_MAX_WALL_TIME_MS} ms per-read wall-time bound`,
  );
}

function assertRawRecordChunksWithinBound(
  chunks: readonly McapTypes.TypedMcapRecords["ChunkIndex"][],
  include: (chunk: McapTypes.TypedMcapRecords["ChunkIndex"]) => boolean,
): void {
  let chunkCount = 0;
  let sourceBytes = 0n;
  let uncompressedBytes = 0n;
  for (const chunk of chunks) {
    if (!include(chunk)) continue;
    chunkCount += 1;
    sourceBytes += chunk.chunkLength;
    uncompressedBytes += chunk.uncompressedSize;
    assertRawRecordSourceWorkBound(chunkCount, sourceBytes, uncompressedBytes);
  }
}

/** Exact materialization for the selected indexed path, with a broad-reader fallback. */
async function readMessageForIndexedEntries({
  candidates,
  channelId,
  reader,
  signal,
  topic,
}: {
  readonly candidates: readonly McapIndexedMessageTime[];
  readonly channelId: number;
  readonly reader: McapIndexedReaderLike;
  readonly signal?: AbortSignal;
  readonly topic: string;
}): Promise<McapRawMessage | null> {
  if (reader.readIndexedMessages) {
    const messages = await materializeIndexedEntries(
      reader,
      candidates,
      signal,
    );
    let selected: McapRawMessage | null = null;
    for (const message of messages) {
      throwIfAborted(signal);
      if (message.channelId !== channelId) continue;
      if (!selected || isPreferredSameTimeMessage(message, selected)) {
        selected = message;
      }
    }
    return selected;
  }

  const logTimeNs = candidates[0]?.logTimeNs;
  if (logTimeNs === undefined) return null;
  void reader
    .prefetchChunkData?.({
      chunkStartOffsets: [
        ...new Set(candidates.map((entry) => entry.chunkStartOffset)),
      ],
    })
    ?.catch(() => undefined);
  // Index entries carry native log times — the same domain readMessages
  // bounds use — so no timeline mapping applies in this compatibility lane.
  let selected: McapRawMessage | null = null;
  let candidateCount = 0;
  let materializedMessageCount = 0;
  let materializedBytes = 0;
  const materializationStartedAtMs = monotonicNowMs();
  const iterator = reader
    .readMessages({
      endTime: logTimeNs,
      startTime: logTimeNs,
      topics: [topic],
    })
    [Symbol.asyncIterator]();
  try {
    let next = await nextRawFallbackMessage(
      iterator,
      signal,
      materializationStartedAtMs + RAW_RECORD_MAX_WALL_TIME_MS,
    );
    while (!next.done) {
      const message = next.value;
      throwIfAborted(signal);
      materializedMessageCount += 1;
      materializedBytes += message.data.byteLength;
      assertRawRecordMessageInputBound(message.data.byteLength);
      assertRawRecordFallbackWorkBound(
        materializedMessageCount,
        materializedBytes,
        monotonicNowMs() - materializationStartedAtMs,
      );
      if (message.channelId === channelId && message.logTime === logTimeNs) {
        candidateCount += 1;
        assertRawRecordIndexedCandidateBound(candidateCount);
        if (!selected || isPreferredSameTimeMessage(message, selected)) {
          selected = message;
        }
      }
      next = await nextRawFallbackMessage(
        iterator,
        signal,
        materializationStartedAtMs + RAW_RECORD_MAX_WALL_TIME_MS,
      );
    }
  } finally {
    const returned = iterator.return?.();
    if (returned) void returned.catch(() => undefined);
  }

  return selected;
}

function isPreferredSameTimeMessage(
  candidate: McapRawMessage,
  current: McapRawMessage,
): boolean {
  return (
    candidate.sequence < current.sequence ||
    (candidate.sequence === current.sequence &&
      candidate.publishTime < current.publishTime)
  );
}

function isPreferredRawMessage(
  candidate: McapRawMessage,
  current: McapRawMessage,
  timeline: McapTimelineStrategy,
): boolean {
  const candidateTimeNs = timeline.messageTimeNs(candidate);
  const currentTimeNs = timeline.messageTimeNs(current);
  return (
    candidateTimeNs > currentTimeNs ||
    (candidateTimeNs === currentTimeNs &&
      isPreferredSameTimeMessage(candidate, current))
  );
}

/**
 * Timeline time of the next indexed message strictly after `afterNs`,
 * probing index records only, bounded to one horizon. No entry within
 * the horizon returns the horizon end; readers without indexes return
 * the caller's fallback.
 */
async function probeNextMessageTimeNs({
  afterNs,
  channelId,
  fallbackNs,
  reader,
  timeline,
  topic,
  signal,
}: {
  readonly afterNs: bigint;
  readonly channelId: number;
  readonly fallbackNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly timeline: McapTimelineStrategy;
  readonly topic: string;
  readonly signal?: AbortSignal;
}): Promise<bigint> {
  throwIfAborted(signal);
  const readIndexedMessageTimes = reader.readIndexedMessageTimes?.bind(reader);
  const indexedMessageTimeNs = timeline.indexedMessageTimeNs;
  const indexedMessageTimesRequest = timeline.indexedMessageTimesRequest;
  if (
    !readIndexedMessageTimes ||
    !indexedMessageTimeNs ||
    !indexedMessageTimesRequest
  ) {
    return fallbackNs;
  }

  // The returned interval must cover the caller's selected target. When a
  // sparse predecessor is older than one probe horizon, index-only successor
  // observation extends through that target before granting validity.
  const horizonEndNs = maxBigInt(
    afterNs + VALIDITY_PROBE_HORIZON_NS,
    fallbackNs,
  );
  for await (const entry of readIndexedMessageTimes({
    ...indexedMessageTimesRequest({
      endTimeNs: horizonEndNs,
      startTimeNs: afterNs + 1n,
      topics: [topic],
    }),
    channelIds: [channelId],
    limit: 1,
  })) {
    throwIfAborted(signal);
    return indexedMessageTimeNs(entry);
  }

  return horizonEndNs;
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}
