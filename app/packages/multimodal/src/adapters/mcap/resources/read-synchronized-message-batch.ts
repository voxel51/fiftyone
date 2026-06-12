import type { McapTypes } from "@mcap/core";
import type { DecodeClient } from "../../../query/decode";
import {
  compareByTimelineTime,
  createWindowBounds,
  isUnboundedLatestPolicy,
  isWithinRange,
  maxBigInt,
  minBigInt,
  selectCandidatesForTopic,
} from "../sync";
import { decodeMcapMessage, mcapMessageRecordId } from "../message-decoder";
import type { McapIndexedMessageTime, McapIndexedReaderLike } from "../reader";
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapDecodedMessage,
  McapReadSynchronizedMessageBatchRequest,
  McapResolvedStreamSyncPolicy,
  McapSynchronizedMessageWindow,
} from "../types";
import type { McapPredecessorStore } from "./predecessor-store";

const INDEXED_LOOKUP_KEY_SEPARATOR = "\0";

/**
 * Bounded lookback used by the raw (non-indexed) fallback path for
 * unbounded-LATEST topics. Readers without chunk indexes cannot start
 * playback today, so this path only serves test fakes — bounded
 * behavior there is acceptable.
 */
const RAW_PREDECESSOR_LOOKBACK_NS = 10_000_000_000n;

interface McapRawMessageCandidate {
  readonly channel: McapTypes.TypedMcapRecords["Channel"];
  readonly message: McapTypes.TypedMcapRecords["Message"];
  readonly schema?: McapTypes.TypedMcapRecords["Schema"];
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
  predecessorStore,
  reader,
  request,
  timeline,
}: {
  readonly decodeClient: DecodeClient;
  readonly predecessorStore?: McapPredecessorStore;
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
  // Unbounded-lookback policies contribute their tick time, not an open
  // start: the scan stays bounded by the batch tick span (plus explicit
  // tolerances) and the open lookback is served by the predecessor probe.
  const startTimeNs = minBigInt(
    windowBounds.flatMap((bounds) =>
      Object.values(bounds.streamPolicies).map(
        (policy) => policy.startTimeNs ?? bounds.timeNs
      )
    )
  );
  const endTimeNs = maxBigInt(
    windowBounds.flatMap((bounds) =>
      Object.values(bounds.streamPolicies).map((policy) => policy.endTimeNs)
    )
  );
  const minTickNs = minBigInt([...request.timeNs]);
  const rawDecodeCache = new Map<string, Promise<McapDecodedMessage>>();
  const indexedCandidates = await collectIndexedCandidates({
    endTimeNs,
    reader,
    startTimeNs,
    timeline,
    topics: request.topics,
  });
  if (indexedCandidates) {
    await backfillIndexedPredecessors({
      candidatesByTopic: indexedCandidates,
      minTickNs,
      predecessorStore,
      reader,
      scanEndTimeNs: endTimeNs,
      scanStartTimeNs: startTimeNs,
      streamPolicies: windowBounds[0].streamPolicies,
      timeline,
    });

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
  await backfillRawPredecessors({
    candidatesByTopic: rawCandidates,
    minTickNs,
    reader,
    streamPolicies: windowBounds[0].streamPolicies,
    timeline,
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

/**
 * Appends predecessor candidates for unbounded-lookback topics whose
 * bounded scan produced nothing at or before the earliest requested
 * tick. One probe answers every tick in the batch: per-topic candidate
 * collection is complete within the scan bounds, so a tick missing a
 * predecessor there shares the predecessor of the earliest tick.
 *
 * Resolutions are memoized with a validity interval, so steady playback
 * over a sparse stream costs zero probes after the first batch.
 */
async function backfillIndexedPredecessors({
  candidatesByTopic,
  minTickNs,
  predecessorStore,
  reader,
  scanEndTimeNs,
  scanStartTimeNs,
  streamPolicies,
  timeline,
}: {
  readonly candidatesByTopic: Map<string, McapIndexedMessageCandidate[]>;
  readonly minTickNs: bigint;
  readonly predecessorStore?: McapPredecessorStore;
  readonly reader: McapIndexedReaderLike;
  readonly scanEndTimeNs: bigint;
  readonly scanStartTimeNs: bigint;
  readonly streamPolicies: Readonly<
    Record<string, McapResolvedStreamSyncPolicy>
  >;
  readonly timeline: McapTimelineStrategy;
}): Promise<void> {
  const indexedMessageTimeNs = timeline.indexedMessageTimeNs;
  const indexedMessageTimesRequest = timeline.indexedMessageTimesRequest;
  if (
    !reader.readLatestIndexedMessageTimes ||
    !indexedMessageTimeNs ||
    !indexedMessageTimesRequest
  ) {
    return;
  }

  // Map the timeline-time bound into the message-index timestamp domain
  // so a future non-log timeline cannot silently mis-probe.
  const probeBoundNs = indexedMessageTimesRequest({
    endTimeNs: minTickNs,
  }).endTimeNs;
  if (probeBoundNs === undefined) {
    return;
  }

  const appendEntries = (
    topic: string,
    entries: readonly McapIndexedMessageTime[]
  ) => {
    if (entries.length === 0) {
      return;
    }
    const topicCandidates = candidatesByTopic.get(topic) ?? [];
    // Same duplicate-identity collapse as the scan collection: one
    // representative per (channel, log time).
    const seenIdentities = new Set<string>();
    for (const entry of entries) {
      const identity = indexedMessageIdentity(entry);
      if (seenIdentities.has(identity)) {
        continue;
      }
      seenIdentities.add(identity);
      topicCandidates.push({
        ...entry,
        timelineTimeNs: indexedMessageTimeNs(entry),
      });
    }
    candidatesByTopic.set(topic, topicCandidates);
  };

  const nextKnownByTopic = new Map<string, bigint>();
  const probeTopicsByLimit = new Map<number, string[]>();

  for (const [topic, policy] of Object.entries(streamPolicies)) {
    if (!isUnboundedLatestPolicy(policy)) {
      continue;
    }

    let earliestInScanNs: bigint | undefined;
    let hasPredecessorInScan = false;
    for (const candidate of candidatesByTopic.get(topic) ?? []) {
      if (candidate.timelineTimeNs <= minTickNs) {
        hasPredecessorInScan = true;
        break;
      }
      if (
        earliestInScanNs === undefined ||
        candidate.timelineTimeNs < earliestInScanNs
      ) {
        earliestInScanNs = candidate.timelineTimeNs;
      }
    }
    if (hasPredecessorInScan) {
      continue;
    }

    // The scan proved the topic silent from its start through the first
    // in-scan candidate (or the scan end) — the memo's validity bound.
    const nextKnownTimeNs = earliestInScanNs ?? scanEndTimeNs + 1n;
    nextKnownByTopic.set(topic, nextKnownTimeNs);

    const memoized = predecessorStore?.lookup(topic, minTickNs, policy.limit);
    if (memoized) {
      appendEntries(topic, memoized);
      predecessorStore?.extend(topic, scanStartTimeNs, nextKnownTimeNs);
      continue;
    }

    const topics = probeTopicsByLimit.get(policy.limit) ?? [];
    topics.push(topic);
    probeTopicsByLimit.set(policy.limit, topics);
  }

  for (const [limitPerTopic, topics] of probeTopicsByLimit) {
    const resolved = await reader.readLatestIndexedMessageTimes({
      limitPerTopic,
      timeNs: probeBoundNs,
      topics,
    });

    for (const topic of topics) {
      const entries = resolved.get(topic) ?? [];
      appendEntries(topic, entries);

      const entryTimes = entries.map(indexedMessageTimeNs);
      predecessorStore?.record(topic, {
        entries,
        limitPerTopic,
        nextKnownTimeNs: nextKnownByTopic.get(topic) ?? minTickNs + 1n,
        predecessorTimeNs: entryTimes.length > 0 ? maxBigInt(entryTimes) : null,
      });
    }
  }
}

/**
 * Raw-path counterpart of the predecessor backfill, used only when the
 * reader has no message-index capabilities (test fakes — see
 * RAW_PREDECESSOR_LOOKBACK_NS). Lookback is bounded; candidates beyond
 * it stay unresolved.
 */
async function backfillRawPredecessors({
  candidatesByTopic,
  minTickNs,
  reader,
  streamPolicies,
  timeline,
}: {
  readonly candidatesByTopic: Map<string, McapRawMessageCandidate[]>;
  readonly minTickNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly streamPolicies: Readonly<
    Record<string, McapResolvedStreamSyncPolicy>
  >;
  readonly timeline: McapTimelineStrategy;
}): Promise<void> {
  const needyTopics = Object.entries(streamPolicies)
    .filter(
      ([topic, policy]) =>
        isUnboundedLatestPolicy(policy) &&
        !(candidatesByTopic.get(topic) ?? []).some(
          (candidate) => candidate.timelineTimeNs <= minTickNs
        )
    )
    .map(([topic]) => topic);
  if (needyTopics.length === 0) {
    return;
  }

  const lookbackStartNs =
    minTickNs > RAW_PREDECESSOR_LOOKBACK_NS
      ? minTickNs - RAW_PREDECESSOR_LOOKBACK_NS
      : 0n;
  const lookback = await collectRawCandidates({
    endTimeNs: minTickNs,
    reader,
    startTimeNs: lookbackStartNs,
    timeline,
    topics: needyTopics,
  });

  for (const topic of needyTopics) {
    const entries = lookback.get(topic);
    if (!entries || entries.length === 0) {
      continue;
    }
    const topicCandidates = candidatesByTopic.get(topic) ?? [];
    topicCandidates.push(...entries);
    candidatesByTopic.set(topic, topicCandidates);
  }
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
          Object.values(streamPolicies).map(
            (policy) => policy.startTimeNs ?? 0n
          )
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
  // Real files can index multiple messages at one (channel, log time) —
  // re-published data or messages duplicated across overlapping chunks.
  // The index can't tell them apart, so keep one representative per
  // identity (the first in deterministic index order).
  const seenIdentities = new Set<string>();
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
    const identity = indexedMessageIdentity(message);
    if (seenIdentities.has(identity)) {
      continue;
    }
    seenIdentities.add(identity);

    const topicCandidates = candidates.get(message.topic) ?? [];
    topicCandidates.push({
      ...message,
      timelineTimeNs,
    });
    candidates.set(message.topic, topicCandidates);
  }

  return candidates;
}

function indexedMessageIdentity(message: McapIndexedMessageTime): string {
  return [message.channelId.toString(), message.logTimeNs.toString()].join(
    INDEXED_LOOKUP_KEY_SEPARATOR
  );
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
  readonly decodeClient: DecodeClient;
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

  // The index gives us channel + log time, not a full raw-message identity.
  const matches = (await rawCandidates).filter(
    (raw) =>
      raw.message.channelId === candidate.channelId &&
      raw.message.logTime === candidate.logTimeNs
  );
  if (matches.length === 0) {
    throw new Error(
      `Missing MCAP message for indexed ${candidate.topic} entry with channel ${
        candidate.channelId
      } at ${candidate.logTimeNs.toString()}`
    );
  }

  // Real recordings can carry several messages on one channel at the
  // same log time (re-published data, duplicates across overlapping
  // chunks). The index can't tell them apart, so resolve to one
  // deterministic representative — failing the whole playback batch
  // over a duplicate timestamp would take every topic in it down.
  if (matches.length === 1) {
    return matches[0];
  }
  return [...matches].sort(compareDuplicateRawMatches)[0];
}

function compareDuplicateRawMatches(
  left: McapRawMessageCandidate,
  right: McapRawMessageCandidate
) {
  if (left.message.sequence !== right.message.sequence) {
    return left.message.sequence - right.message.sequence;
  }

  return compareBigInt(left.message.publishTime, right.message.publishTime);
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
  readonly decodeClient: DecodeClient;
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
  return [candidate.topic, candidate.logTimeNs.toString()].join(
    INDEXED_LOOKUP_KEY_SEPARATOR
  );
}

function indexedCandidateRecordId(candidate: McapIndexedMessageCandidate) {
  return [
    candidate.topic,
    candidate.channelId.toString(),
    candidate.logTimeNs.toString(),
    candidate.chunkStartOffset.toString(),
    candidate.messageOffset.toString(),
  ].join(INDEXED_LOOKUP_KEY_SEPARATOR);
}

function compareBigInt(left: bigint, right: bigint) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
