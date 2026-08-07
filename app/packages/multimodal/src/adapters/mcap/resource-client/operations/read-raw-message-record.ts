import type { McapTypes } from "@mcap/core";
import type { McapIndexedReaderLike } from "../../reader/index";
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

/**
 * Bounded lookback used by the degraded but supported lane for MCAP files
 * without message indexes (mirrors the synchronized-batch fallback).
 */
const FALLBACK_LOOKBACK_NS = 10_000_000_000n;

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

/**
 * Validity granted by the fallback path, which cannot probe the next
 * message time without decoding chunks.
 */
const FALLBACK_VALIDITY_NS = 1_000_000_000n;

type McapRawMessage = McapTypes.TypedMcapRecords["Message"];

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
  const topicChannel = mcapChannelForTopic(reader, request.topic);
  const topicSchema = reader.schemasById.get(topicChannel.schemaId);
  const base = {
    messageEncoding: topicChannel.messageEncoding,
    schemaName: topicSchema?.name ?? null,
    topic: request.topic,
  };

  const message = await selectMessageAtOrBefore({
    reader,
    timeline,
    timeNs: request.timeNs,
    topic: request.topic,
    signal,
  });

  if (!message) {
    return {
      ...base,
      status: "empty",
      validFromNs: 0n,
      validUntilNs: await probeNextMessageTimeNs({
        afterNs: request.timeNs,
        fallbackNs: request.timeNs + FALLBACK_VALIDITY_NS,
        reader,
        timeline,
        topic: request.topic,
        signal,
      }),
    };
  }

  const messageTimeNs = timeline.messageTimeNs(message);
  assertRawRecordMessageInputBound(message.data.byteLength);
  const validUntilNs = await probeNextMessageTimeNs({
    afterNs: messageTimeNs,
    fallbackNs: request.timeNs + FALLBACK_VALIDITY_NS,
    reader,
    timeline,
    topic: request.topic,
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
  reader,
  timeline,
  timeNs,
  topic,
  signal,
}: {
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
        timeNs: probeBoundNs,
        topics: [topic],
      });
      throwIfAborted(signal);
      const entry = latestByTopic.get(topic)?.[0];
      if (!entry) {
        return null;
      }

      assertRawRecordChunksWithinBound(
        reader.chunkIndexes,
        (chunk) => chunk.chunkStartOffset === entry.chunkStartOffset,
      );
      void reader.prefetchChunkData?.({
        chunkStartOffsets: [entry.chunkStartOffset],
      });
      return readMessageForIndexedEntry({
        channelId: entry.channelId,
        logTimeNs: entry.logTimeNs,
        reader,
        signal,
        topic,
      });
    }
  }

  // Fallback: bounded lookback scan, newest message at or before wins.
  const { endTime, startTime } = timeline.messageReadRange({
    endTimeNs: timeNs,
    startTimeNs:
      timeNs > FALLBACK_LOOKBACK_NS ? timeNs - FALLBACK_LOOKBACK_NS : 0n,
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
      if (timeline.messageTimeNs(message) <= timeNs) {
        if (
          !newest ||
          timeline.messageTimeNs(message) >= timeline.messageTimeNs(newest)
        ) {
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

/**
 * Fetches the full message behind one index entry. Duplicate log times
 * on one channel resolve to a deterministic representative (lowest
 * sequence, then publish time) — same policy as playback selection.
 */
async function readMessageForIndexedEntry({
  channelId,
  logTimeNs,
  reader,
  signal,
  topic,
}: {
  readonly channelId: number;
  readonly logTimeNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly signal?: AbortSignal;
  readonly topic: string;
}): Promise<McapRawMessage | null> {
  // Index entries carry native log times — the same domain readMessages
  // bounds use — so no timeline mapping applies here.
  let selected: McapRawMessage | null = null;
  let candidateCount = 0;
  for await (const message of reader.readMessages({
    endTime: logTimeNs,
    startTime: logTimeNs,
    topics: [topic],
  })) {
    throwIfAborted(signal);
    if (message.channelId !== channelId || message.logTime !== logTimeNs) {
      continue;
    }
    candidateCount += 1;
    assertRawRecordIndexedCandidateBound(candidateCount);
    if (
      !selected ||
      message.sequence < selected.sequence ||
      (message.sequence === selected.sequence &&
        message.publishTime < selected.publishTime)
    ) {
      selected = message;
    }
  }

  return selected;
}

/**
 * Timeline time of the next indexed message strictly after `afterNs`,
 * probing index records only, bounded to one horizon. No entry within
 * the horizon returns the horizon end; readers without indexes return
 * the caller's fallback.
 */
async function probeNextMessageTimeNs({
  afterNs,
  fallbackNs,
  reader,
  timeline,
  topic,
  signal,
}: {
  readonly afterNs: bigint;
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

  const horizonEndNs = afterNs + VALIDITY_PROBE_HORIZON_NS;
  for await (const entry of readIndexedMessageTimes({
    ...indexedMessageTimesRequest({
      endTimeNs: horizonEndNs,
      startTimeNs: afterNs + 1n,
      topics: [topic],
    }),
    limit: 1,
  })) {
    throwIfAborted(signal);
    return indexedMessageTimeNs(entry);
  }

  return horizonEndNs;
}
