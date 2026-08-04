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

/**
 * Forward index probe horizon for the result's validity window. Absence
 * of a next message within it yields `validUntilNs` at the horizon — a
 * safe lower bound; the caller's next request past it re-selects the
 * same message and probes the next horizon.
 */
const VALIDITY_PROBE_HORIZON_NS = 60_000_000_000n;

/**
 * Bounded lookback used by the raw (non-indexed) fallback path. Readers
 * without message indexes only serve test fakes today (mirrors the
 * synchronized-batch fallback).
 */
const FALLBACK_LOOKBACK_NS = 10_000_000_000n;

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
  timeline,
}: {
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadRawMessageRecordRequest;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapRawMessageRecordResult> {
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
      }),
    };
  }

  const messageTimeNs = timeline.messageTimeNs(message);
  const validUntilNs = await probeNextMessageTimeNs({
    afterNs: messageTimeNs,
    fallbackNs: request.timeNs + FALLBACK_VALIDITY_NS,
    reader,
    timeline,
    topic: request.topic,
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
}: {
  readonly reader: McapIndexedReaderLike;
  readonly timeline: McapTimelineStrategy;
  readonly timeNs: bigint;
  readonly topic: string;
}): Promise<McapRawMessage | null> {
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
      const entry = latestByTopic.get(topic)?.[0];
      if (!entry) {
        return null;
      }

      void reader.prefetchChunkData?.({
        chunkStartOffsets: [entry.chunkStartOffset],
      });
      return readMessageForIndexedEntry({
        channelId: entry.channelId,
        logTimeNs: entry.logTimeNs,
        reader,
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
  for await (const message of reader.readMessages({
    endTime,
    startTime,
    topics: [topic],
  })) {
    // Re-check the bound: fakes (and some readers) over-yield.
    if (timeline.messageTimeNs(message) > timeNs) {
      continue;
    }
    if (
      !newest ||
      timeline.messageTimeNs(message) >= timeline.messageTimeNs(newest)
    ) {
      newest = message;
    }
  }

  return newest;
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
  topic,
}: {
  readonly channelId: number;
  readonly logTimeNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly topic: string;
}): Promise<McapRawMessage | null> {
  // Index entries carry native log times — the same domain readMessages
  // bounds use — so no timeline mapping applies here.
  let selected: McapRawMessage | null = null;
  for await (const message of reader.readMessages({
    endTime: logTimeNs,
    startTime: logTimeNs,
    topics: [topic],
  })) {
    if (message.channelId !== channelId || message.logTime !== logTimeNs) {
      continue;
    }
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
}: {
  readonly afterNs: bigint;
  readonly fallbackNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly timeline: McapTimelineStrategy;
  readonly topic: string;
}): Promise<bigint> {
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
    return indexedMessageTimeNs(entry);
  }

  return horizonEndNs;
}
