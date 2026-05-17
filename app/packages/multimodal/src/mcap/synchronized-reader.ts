import type { McapTypes } from "@mcap/core";
import type { DecodeResourceClient } from "../client/resources";
import {
  compareByTimelineTime,
  createWindowBounds,
  isWithinRange,
  maxBigInt,
  minBigInt,
  selectCandidatesForTopic,
} from "./sync";
import { decodeMcapMessage, mcapMessageRecordId } from "./message-decoder";
import type { McapIndexedMessageTime, McapIndexedReaderLike } from "./reader";
import type { McapTimelineStrategy } from "./timeline";
import type {
  McapDecodedMessage,
  McapReadSynchronizedMessageBatchRequest,
  McapSynchronizedMessageWindow,
} from "./types";

type TypedMcapRecords = McapTypes.TypedMcapRecords;

interface McapRawMessageCandidate {
  readonly channel: TypedMcapRecords["Channel"];
  readonly message: TypedMcapRecords["Message"];
  readonly schema?: TypedMcapRecords["Schema"];
  readonly timelineTimeNs: bigint;
  readonly topic: string;
}

interface McapIndexedMessageCandidate extends McapIndexedMessageTime {
  readonly timelineTimeNs: bigint;
}

/**
 * Reads and decodes synchronized MCAP windows for one batched playback request.
 */
export async function readMcapSynchronizedMessageBatch({
  decodeClient,
  reader,
  request,
  timeline,
}: {
  readonly decodeClient: DecodeResourceClient;
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadSynchronizedMessageBatchRequest;
  readonly timeline: McapTimelineStrategy;
}): Promise<readonly McapSynchronizedMessageWindow[]> {
  if (request.timeNs.length === 0) {
    return [];
  }

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
  const rawDecodeCache = new Map<string, Promise<McapDecodedMessage>>();
  const indexedCandidates = await collectIndexedCandidates({
    endTimeNs,
    reader,
    startTimeNs,
    timeline,
    topics: request.topics,
  });
  if (indexedCandidates) {
    const indexedDecodeCache = new Map<string, Promise<McapDecodedMessage>>();
    const rawReadCache = new Map<
      string,
      Promise<readonly McapRawMessageCandidate[]>
    >();

    return decodeWindowsFromCandidates({
      candidates: indexedCandidates,
      decodeCandidate: (candidate) =>
        decodeIndexedCandidate({
          candidate,
          decodeClient,
          indexedDecodeCache,
          rawDecodeCache,
          rawReadCache,
          reader,
          source: request.source,
          timeline,
        }),
      selectTieBreaker: compareIndexedCandidateTieBreaker,
      timeline,
      topics: request.topics,
      windowBounds,
    });
  }

  const rawCandidates = await collectRawCandidates({
    endTimeNs,
    reader,
    startTimeNs,
    timeline,
    topics: request.topics,
  });

  return decodeWindowsFromCandidates({
    candidates: rawCandidates,
    decodeCandidate: (candidate) =>
      decodeRawCandidate({
        candidate,
        decodeCache: rawDecodeCache,
        decodeClient,
        source: request.source,
        timeline,
      }),
    selectTieBreaker: compareRawCandidateTieBreaker,
    timeline,
    topics: request.topics,
    windowBounds,
  });
}

async function decodeWindowsFromCandidates<
  Candidate extends { readonly timelineTimeNs: bigint; readonly topic: string }
>({
  candidates,
  decodeCandidate,
  selectTieBreaker,
  timeline,
  topics,
  windowBounds,
}: {
  readonly candidates: ReadonlyMap<string, readonly Candidate[]>;
  readonly decodeCandidate: (
    candidate: Candidate
  ) => Promise<McapDecodedMessage>;
  readonly selectTieBreaker: (left: Candidate, right: Candidate) => number;
  readonly timeline: McapTimelineStrategy;
  readonly topics: readonly string[];
  readonly windowBounds: readonly {
    readonly timeNs: bigint;
    readonly streamPolicies: McapSynchronizedMessageWindow["streamPolicies"];
  }[];
}): Promise<readonly McapSynchronizedMessageWindow[]> {
  return Promise.all(
    windowBounds.map(async ({ timeNs, streamPolicies }) => {
      const messagesByTopic: Record<string, readonly McapDecodedMessage[]> = {};
      const messages: McapDecodedMessage[] = [];

      for (const topic of topics) {
        const selected = selectCandidatesForTopic(
          candidates.get(topic) ?? [],
          timeNs,
          streamPolicies[topic],
          selectTieBreaker
        );
        const decoded = await Promise.all(selected.map(decodeCandidate));
        messagesByTopic[topic] = decoded;
        messages.push(...decoded);
      }

      messages.sort(compareByTimelineTime);

      return {
        activeTimeline: timeline.id,
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

async function collectIndexedCandidates({
  endTimeNs,
  reader,
  startTimeNs,
  timeline,
  topics,
}: {
  readonly endTimeNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly startTimeNs: bigint;
  readonly timeline: McapTimelineStrategy;
  readonly topics: readonly string[];
}): Promise<Map<string, McapIndexedMessageCandidate[]> | undefined> {
  if (
    !reader.readIndexedMessageTimes ||
    !timeline.indexedMessageTimeNs ||
    !timeline.indexedMessageTimesRequest
  ) {
    return undefined;
  }

  const candidates = new Map<string, McapIndexedMessageCandidate[]>();
  const indexedRequest = timeline.indexedMessageTimesRequest({
    endTimeNs,
    startTimeNs,
    topics,
  });

  for await (const message of reader.readIndexedMessageTimes(indexedRequest)) {
    const timelineTimeNs = timeline.indexedMessageTimeNs(message);
    if (!isWithinRange(timelineTimeNs, startTimeNs, endTimeNs)) {
      continue;
    }

    const topicCandidates = candidates.get(message.topic) ?? [];
    topicCandidates.push({
      ...message,
      timelineTimeNs,
    });
    candidates.set(message.topic, topicCandidates);
  }

  return candidates;
}

async function collectRawCandidates({
  endTimeNs,
  reader,
  startTimeNs,
  timeline,
  topics,
}: {
  readonly endTimeNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly startTimeNs: bigint;
  readonly timeline: McapTimelineStrategy;
  readonly topics: readonly string[];
}): Promise<Map<string, McapRawMessageCandidate[]>> {
  const candidates = new Map<string, McapRawMessageCandidate[]>();
  const { endTime, startTime } = timeline.messageReadRange({
    endTimeNs,
    startTimeNs,
  });

  for await (const message of reader.readMessages({
    endTime,
    startTime,
    topics,
  })) {
    const channel = reader.channelsById.get(message.channelId);
    if (!channel) {
      throw new Error(`Missing MCAP channel ${message.channelId}`);
    }

    const timelineTimeNs = timeline.messageTimeNs(message);
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

async function decodeIndexedCandidate({
  candidate,
  decodeClient,
  indexedDecodeCache,
  rawDecodeCache,
  rawReadCache,
  reader,
  source,
  timeline,
}: {
  readonly candidate: McapIndexedMessageCandidate;
  readonly decodeClient: DecodeResourceClient;
  readonly indexedDecodeCache: Map<string, Promise<McapDecodedMessage>>;
  readonly rawDecodeCache: Map<string, Promise<McapDecodedMessage>>;
  readonly rawReadCache: Map<
    string,
    Promise<readonly McapRawMessageCandidate[]>
  >;
  readonly reader: McapIndexedReaderLike;
  readonly source: McapReadSynchronizedMessageBatchRequest["source"];
  readonly timeline: McapTimelineStrategy;
}): Promise<McapDecodedMessage> {
  const key = indexedCandidateRecordId(candidate);
  let decoded = indexedDecodeCache.get(key);

  if (!decoded) {
    decoded = resolveRawCandidateForIndexedMessage({
      candidate,
      rawReadCache,
      reader,
      timeline,
    }).then((rawCandidate) =>
      decodeRawCandidate({
        candidate: rawCandidate,
        decodeCache: rawDecodeCache,
        decodeClient,
        source,
        timeline,
      })
    );
    indexedDecodeCache.set(key, decoded);
  }

  return decoded;
}

async function resolveRawCandidateForIndexedMessage({
  candidate,
  rawReadCache,
  reader,
  timeline,
}: {
  readonly candidate: McapIndexedMessageCandidate;
  readonly rawReadCache: Map<
    string,
    Promise<readonly McapRawMessageCandidate[]>
  >;
  readonly reader: McapIndexedReaderLike;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapRawMessageCandidate> {
  const key = serializeIndexedLookupKey(candidate);
  let rawCandidates = rawReadCache.get(key);

  if (!rawCandidates) {
    rawCandidates = collectRawCandidatesForIndexedLookup({
      candidate,
      reader,
      timeline,
    });
    rawReadCache.set(key, rawCandidates);
  }

  const rawCandidate = (await rawCandidates).find(
    (raw) =>
      raw.message.channelId === candidate.channelId &&
      raw.message.logTime === candidate.logTimeNs
  );
  if (!rawCandidate) {
    throw new Error(
      `Missing MCAP message for indexed ${
        candidate.topic
      } entry at ${candidate.logTimeNs.toString()}`
    );
  }

  return rawCandidate;
}

async function collectRawCandidatesForIndexedLookup({
  candidate,
  reader,
  timeline,
}: {
  readonly candidate: McapIndexedMessageCandidate;
  readonly reader: McapIndexedReaderLike;
  readonly timeline: McapTimelineStrategy;
}): Promise<readonly McapRawMessageCandidate[]> {
  const candidates = await collectRawCandidates({
    endTimeNs: candidate.timelineTimeNs,
    reader,
    startTimeNs: candidate.timelineTimeNs,
    timeline,
    topics: [candidate.topic],
  });

  return candidates.get(candidate.topic) ?? [];
}

async function decodeRawCandidate({
  candidate,
  decodeCache,
  decodeClient,
  source,
  timeline,
}: {
  readonly candidate: McapRawMessageCandidate;
  readonly decodeCache: Map<string, Promise<McapDecodedMessage>>;
  readonly decodeClient: DecodeResourceClient;
  readonly source: McapReadSynchronizedMessageBatchRequest["source"];
  readonly timeline: McapTimelineStrategy;
}): Promise<McapDecodedMessage> {
  const key = mcapMessageRecordId(candidate.message);
  let decoded = decodeCache.get(key);

  if (!decoded) {
    decoded = decodeMcapMessage({
      channel: candidate.channel,
      decodeClient,
      message: candidate.message,
      schema: candidate.schema,
      source,
      timeline,
    });
    decodeCache.set(key, decoded);
  }

  return decoded;
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

function compareIndexedCandidateTieBreaker(
  left: McapIndexedMessageCandidate,
  right: McapIndexedMessageCandidate
) {
  if (left.channelId !== right.channelId) {
    return left.channelId - right.channelId;
  }

  const chunkComparison = compareBigInt(
    left.chunkStartOffset,
    right.chunkStartOffset
  );
  if (chunkComparison !== 0) {
    return chunkComparison;
  }

  return compareBigInt(left.messageOffset, right.messageOffset);
}

function serializeIndexedLookupKey(candidate: McapIndexedMessageCandidate) {
  return [candidate.topic, candidate.logTimeNs.toString()].join("\0");
}

function indexedCandidateRecordId(candidate: McapIndexedMessageCandidate) {
  return [
    candidate.topic,
    candidate.channelId.toString(),
    candidate.logTimeNs.toString(),
    candidate.chunkStartOffset.toString(),
    candidate.messageOffset.toString(),
  ].join("\0");
}

function compareBigInt(left: bigint, right: bigint) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
