import type { McapTypes } from "@mcap/core";
import type { DecodeClient } from "../../../../query/decoding/index";
import { compareBigInt } from "../../../../ir/index";
import { EpisodeReadCancelledError } from "../../../../ports/index";
import {
  createCandidateSelector,
  createWindowBounds,
  isUnboundedLatestPolicy,
  isWithinRange,
  maxBigInt,
  minBigInt,
} from "../../synchronization/policy";
import {
  isMcapTopicDecodeError,
  type McapTopicDecodeError,
} from "../../normalization/errors";
import { decodeMcapMessage } from "../message-decoder";
import {
  materializeIndexedEntries,
  type McapIndexedMessageTime,
  type McapIndexedReaderLike,
} from "../../reader/index";
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapDecodedMessage,
  McapReadSynchronizedMessageBatchRequest,
  McapResolvedStreamSyncPolicy,
  McapSynchronizedMessageWindow,
  McapTopicDecodeDiagnostic,
} from "../../contracts/index";
import type { McapPredecessorStore } from "../predecessor-store";
import { resolveIndexedPredecessorRound } from "../indexed-predecessor-probe";

const INDEXED_LOOKUP_KEY_SEPARATOR = "\0";
const INDEXED_RECORD_ID_PHYSICAL_PART_COUNT = 5;

/** Decoder-option components appended to one physical indexed record id. */
export const INDEXED_RECORD_ID_OPTION_PART_COUNT = 2;

/** Physical and decoder-option identities encoded by one indexed record id. */
export interface IndexedRecordIdentityParts {
  readonly decoderOptionsIdentity: string;
  readonly physicalRecordIdentity: string;
}

/** Mints the stable record id shared by retained-record protocol consumers. */
export function mintIndexedRecordIdentity(
  candidate: McapIndexedMessageTime,
  options: {
    readonly cacheKeySuffix: string;
    readonly pointCloudColorBy?: string;
  },
): string {
  return mintIndexedRecordIdentityFromPhysical(
    indexedCandidateRecordId(candidate),
    options,
  );
}

function mintIndexedRecordIdentityFromPhysical(
  physicalRecordIdentity: string,
  options: {
    readonly cacheKeySuffix: string;
    readonly pointCloudColorBy?: string;
  },
): string {
  const decoderOptionParts = [
    options.cacheKeySuffix,
    options.pointCloudColorBy ?? "auto",
  ];
  if (decoderOptionParts.length !== INDEXED_RECORD_ID_OPTION_PART_COUNT) {
    throw new Error("Indexed record decoder-option identity is incomplete");
  }
  if (
    decoderOptionParts.some((part) =>
      part.includes(INDEXED_LOOKUP_KEY_SEPARATOR),
    )
  ) {
    throw new Error("Indexed record decoder options cannot contain NUL bytes");
  }
  return [physicalRecordIdentity, ...decoderOptionParts].join(
    INDEXED_LOOKUP_KEY_SEPARATOR,
  );
}

/** Splits a minted indexed record id into physical and option identities. */
export function parseIndexedRecordIdentity(
  recordId: string,
): IndexedRecordIdentityParts {
  const parts = recordId.split(INDEXED_LOOKUP_KEY_SEPARATOR);
  if (
    parts.length <
    INDEXED_RECORD_ID_PHYSICAL_PART_COUNT + INDEXED_RECORD_ID_OPTION_PART_COUNT
  ) {
    return {
      decoderOptionsIdentity: "unknown",
      physicalRecordIdentity: recordId,
    };
  }
  return {
    decoderOptionsIdentity: parts
      .slice(-INDEXED_RECORD_ID_OPTION_PART_COUNT)
      .join(INDEXED_LOOKUP_KEY_SEPARATOR),
    physicalRecordIdentity: parts
      .slice(0, -INDEXED_RECORD_ID_OPTION_PART_COUNT)
      .join(INDEXED_LOOKUP_KEY_SEPARATOR),
  };
}

/**
 * Bounded lookback used by the raw fallback for supported MCAP files without
 * message indexes. This degraded lane cannot probe arbitrary history, so
 * unbounded-LATEST selection is intentionally limited to recent messages.
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

type McapSynchronizedMessageIdentity = {
  readonly timelineTimeNs: bigint;
  readonly topic: string;
};

export type McapSynchronizedMessageWindowWithMessages<
  Message extends McapSynchronizedMessageIdentity,
> = Omit<McapSynchronizedMessageWindow, "messages" | "messagesByTopic"> & {
  readonly messages: readonly Message[];
  readonly messagesByTopic: Readonly<Record<string, readonly Message[]>>;
};

export type McapIndexedMessageReuse<Message> = (candidate: {
  readonly recordId: string;
  readonly timelineTimeNs: bigint;
  readonly topic: string;
}) => Message | undefined;

type McapSettledTopicDecode<Message> =
  | { readonly decoded: Message; readonly status: "decoded" }
  | { readonly error: McapTopicDecodeError; readonly status: "error" };

// Raw candidates are materialized once per batch; indexed lookups share them
// through rawReadCache. Object identity avoids payload scans while the nested
// map preserves point-cloud color variants.
type McapRawDecodeCache = Map<
  McapTypes.TypedMcapRecords["Message"],
  Map<string, Promise<McapDecodedMessage>>
>;

/**
 * Reads and decodes synchronized MCAP windows for one batched playback request.
 */
export async function readMcapSynchronizedMessageBatch<
  ReusedMessage extends McapSynchronizedMessageIdentity = never,
>({
  decodeClient,
  predecessorStore,
  reader,
  readSignal,
  request,
  reuseIndexedMessage,
  onTopicSettlement,
  timeline,
}: {
  readonly decodeClient: DecodeClient;
  readonly predecessorStore?: McapPredecessorStore;
  readonly reader: McapIndexedReaderLike;
  readonly readSignal?: { readonly current: AbortSignal | null };
  readonly request: McapReadSynchronizedMessageBatchRequest;
  readonly reuseIndexedMessage?: McapIndexedMessageReuse<ReusedMessage>;
  readonly onTopicSettlement?: (settlement: {
    readonly topic: string;
    readonly window: McapSynchronizedMessageWindowWithMessages<
      McapDecodedMessage | ReusedMessage
    >;
  }) => void;
  readonly timeline: McapTimelineStrategy;
}): Promise<
  readonly McapSynchronizedMessageWindowWithMessages<
    McapDecodedMessage | ReusedMessage
  >[]
> {
  if (request.timeNs.length === 0) {
    return [];
  }

  const windowBounds = request.timeNs.map((timeNs) =>
    createWindowBounds({
      timeNs,
      defaultStreamPolicy: request.defaultStreamPolicy,
      streamPolicies: request.streamPolicies,
      topics: request.topics,
    }),
  );
  // Unbounded-lookback policies contribute their tick time, not an open
  // start: the scan stays bounded by the batch tick span (plus explicit
  // tolerances) and the open lookback is served by the predecessor probe.
  const startTimeNs = minBigInt(
    windowBounds.flatMap((bounds) =>
      Object.values(bounds.streamPolicies).map(
        (policy) => policy.startTimeNs ?? bounds.timeNs,
      ),
    ),
  );
  const endTimeNs = maxBigInt(
    windowBounds.flatMap((bounds) =>
      Object.values(bounds.streamPolicies).map((policy) => policy.endTimeNs),
    ),
  );
  const minTickNs = minBigInt([...request.timeNs]);
  const rawDecodeCache: McapRawDecodeCache = new Map();
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

    const indexedDecodeCache = new Map<
      string,
      Promise<McapDecodedMessage | ReusedMessage>
    >();
    const reusedIndexedMessages = new Map<string, ReusedMessage>();
    const rawReadCache = new Map<
      string,
      Promise<readonly McapRawMessageCandidate[]>
    >();
    let selectedRawCandidates:
      | Promise<
          ReadonlyMap<McapIndexedMessageCandidate, McapRawMessageCandidate>
        >
      | undefined;

    return decodeWindowsFromCandidates({
      candidates: indexedCandidates,
      // Decode dominates warm batches, and a worker lane is serial: without
      // decode-boundary aborts a cancelled batch would keep the lane busy
      // for seconds before the next sample's reads run.
      throwIfAborted: () => {
        if (readSignal?.current?.aborted) {
          throw new EpisodeReadCancelledError();
        }
      },
      decodeCandidate: (candidate) =>
        decodeIndexedCandidate({
          candidate,
          decodeClient,
          indexedDecodeCache,
          rawDecodeCache,
          rawReadCache,
          reader,
          selectedRawCandidates,
          pointCloudColorBy:
            request.pointCloudColorByByTopic?.[candidate.topic],
          reusedIndexedMessages,
          signal: readSignal?.current ?? undefined,
          source: request.source,
          timeline,
        }),
      settlementPriorityTopics: request.settlementPriorityTopics,
      estimateCandidateBytes: async (candidate) => {
        const identity = indexedCandidateReuseIdentity({
          candidate,
          pointCloudColorBy:
            request.pointCloudColorByByTopic?.[candidate.topic],
          timeline,
        });
        if (reusedIndexedMessages.has(identity.recordId)) return 0;
        const materialized = await selectedRawCandidates;
        return (
          materialized?.get(candidate)?.message.data.byteLength ??
          Number.MAX_SAFE_INTEGER
        );
      },
      // Selected candidates name their chunks exactly, so the byte layer can
      // pipeline those chunk fetches while decoding walks them serially.
      onCandidatesSelected: (selected) => {
        const misses = selected.filter((candidate) => {
          const identity = indexedCandidateReuseIdentity({
            candidate,
            pointCloudColorBy:
              request.pointCloudColorByByTopic?.[candidate.topic],
            timeline,
          });
          const reused = reuseIndexedMessage?.(identity);
          if (reused === undefined) return true;
          reusedIndexedMessages.set(identity.recordId, reused);
          return false;
        });
        if (misses.length === 0) return;
        if (reader.readIndexedMessages) {
          selectedRawCandidates = materializeIndexedSelection({
            candidates: misses,
            reader,
            signal: readSignal?.current ?? undefined,
            timeline,
          });
        }
      },
      onTopicSettlement,
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
        pointCloudColorBy: request.pointCloudColorByByTopic?.[candidate.topic],
        signal: readSignal?.current ?? undefined,
        source: request.source,
        timeline,
      }),
    settlementPriorityTopics: request.settlementPriorityTopics,
    estimateCandidateBytes: (candidate) => candidate.message.data.byteLength,
    onTopicSettlement,
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
    entries: readonly McapIndexedMessageTime[],
  ) => {
    if (entries.length === 0) {
      return;
    }
    const topicCandidates = candidatesByTopic.get(topic) ?? [];
    // Same duplicate-identity collapse as the scan collection: one
    // representative per (channel, log time).
    const seenIdentities = new Set<string>(
      topicCandidates.map(indexedMessageIdentity),
    );
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
    let predecessorCount = 0;
    const seenPredecessors = new Set<string>();
    for (const candidate of candidatesByTopic.get(topic) ?? []) {
      if (candidate.timelineTimeNs <= minTickNs) {
        const identity = indexedMessageIdentity(candidate);
        if (!seenPredecessors.has(identity)) {
          seenPredecessors.add(identity);
          predecessorCount += 1;
        }
        continue;
      }
      if (
        earliestInScanNs === undefined ||
        candidate.timelineTimeNs < earliestInScanNs
      ) {
        earliestInScanNs = candidate.timelineTimeNs;
      }
    }
    if (predecessorCount >= policy.limit) {
      continue;
    }

    // The scan proved the topic silent from its start through the first
    // in-scan candidate (or the scan end) — the memo's validity bound.
    const nextKnownTimeNs = earliestInScanNs ?? scanEndTimeNs + 1n;
    nextKnownByTopic.set(topic, nextKnownTimeNs);

    const topics = probeTopicsByLimit.get(policy.limit) ?? [];
    topics.push(topic);
    probeTopicsByLimit.set(policy.limit, topics);
  }

  for (const [limitPerTopic, topics] of probeTopicsByLimit) {
    const resolved = await resolveIndexedPredecessorRound({
      extendFromTimeNs: scanStartTimeNs,
      indexedMessageTimeNs,
      limitPerTopic,
      nextKnownTimeNs: (topic) => nextKnownByTopic.get(topic) ?? minTickNs + 1n,
      predecessorStore,
      probeTimeNs: probeBoundNs,
      reader,
      timeNs: minTickNs,
      topics,
    });

    for (const topic of topics) {
      const entries = resolved.entriesByTopic.get(topic) ?? [];
      appendEntries(topic, entries);
    }
  }
}

/**
 * Raw-path counterpart of predecessor backfill for supported MCAP files
 * without message indexes. Lookback is bounded; older candidates remain
 * unresolved as part of the documented degraded experience.
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
          (candidate) => candidate.timelineTimeNs <= minTickNs,
        ),
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
  Candidate extends { readonly timelineTimeNs: bigint; readonly topic: string },
  Message extends McapSynchronizedMessageIdentity,
>({
  candidates,
  decodeCandidate,
  settlementPriorityTopics,
  estimateCandidateBytes,
  onCandidatesSelected,
  onTopicSettlement,
  selectTieBreaker,
  throwIfAborted,
  timeline,
  topics,
  windowBounds,
}: {
  readonly candidates: ReadonlyMap<string, readonly Candidate[]>;
  readonly decodeCandidate: (candidate: Candidate) => Promise<Message>;
  readonly settlementPriorityTopics?: readonly string[];
  readonly estimateCandidateBytes?: (
    candidate: Candidate,
  ) => number | Promise<number>;
  readonly onCandidatesSelected?: (selected: readonly Candidate[]) => void;
  readonly onTopicSettlement?: (settlement: {
    readonly topic: string;
    readonly window: McapSynchronizedMessageWindowWithMessages<Message>;
  }) => void;
  readonly selectTieBreaker: (left: Candidate, right: Candidate) => number;
  readonly throwIfAborted?: () => void;
  readonly timeline: McapTimelineStrategy;
  readonly topics: readonly string[];
  readonly windowBounds: readonly {
    readonly timeNs: bigint;
    readonly streamPolicies: McapSynchronizedMessageWindow["streamPolicies"];
  }[];
}): Promise<readonly McapSynchronizedMessageWindowWithMessages<Message>[]> {
  // Selection is synchronous, so resolve every window's candidate set before
  // any decode read starts: the union names exactly which messages (and
  // therefore chunks) this batch touches.
  const selectorsByTopic = new Map(
    topics.map(
      (topic) =>
        [
          topic,
          createCandidateSelector(
            candidates.get(topic) ?? [],
            selectTieBreaker,
          ),
        ] as const,
    ),
  );
  const selections = windowBounds.map(({ timeNs, streamPolicies }) => ({
    selectedByTopic: topics.map(
      (topic) =>
        [
          topic,
          selectorsByTopic.get(topic)?.(timeNs, streamPolicies[topic]) ?? [],
        ] as const,
    ),
    streamPolicies,
    timeNs,
  }));

  if (onCandidatesSelected) {
    const seen = new Set<Candidate>();
    const union: Candidate[] = [];
    for (const selection of selections) {
      for (const [, selected] of selection.selectedByTopic) {
        for (const candidate of selected) {
          if (!seen.has(candidate)) {
            seen.add(candidate);
            union.push(candidate);
          }
        }
      }
    }
    if (union.length > 0) {
      onCandidatesSelected(union);
    }
  }

  return Promise.all(
    selections.map(async ({ selectedByTopic, streamPolicies, timeNs }) => {
      const messagesByTopic: Record<string, readonly Message[]> = {};
      const decodeErrorsByTopic: Record<
        string,
        readonly McapTopicDecodeDiagnostic[]
      > = {};
      const messages: Message[] = [];
      const firstSettlementTopic = await selectFirstSettlementTopic({
        estimateCandidateBytes,
        settlementPriorityTopics,
        selectedByTopic,
      });
      const decodeOrder = firstSettlementTopic
        ? [
            ...selectedByTopic.filter(
              ([topic]) => topic === firstSettlementTopic,
            ),
            ...selectedByTopic.filter(
              ([topic]) => topic !== firstSettlementTopic,
            ),
          ]
        : selectedByTopic;

      for (const [topic, selected] of decodeOrder) {
        throwIfAborted?.();
        const settled: readonly McapSettledTopicDecode<Message>[] =
          await Promise.all(
            selected.map(async (candidate) => {
              try {
                return {
                  decoded: await decodeCandidate(candidate),
                  status: "decoded",
                } as const;
              } catch (error) {
                if (!isMcapTopicDecodeError(error)) throw error;
                return { error, status: "error" } as const;
              }
            }),
          );
        const errors = settled
          .filter(
            (
              result,
            ): result is Extract<
              McapSettledTopicDecode<Message>,
              { readonly status: "error" }
            > => result.status === "error",
          )
          .map((result) => result.error);
        if (errors.length > 0) {
          // Topic-atomic per window: never mix a partially decoded source
          // with siblings from the same synchronized selection.
          messagesByTopic[topic] = [];
          decodeErrorsByTopic[topic] = [
            ...new Map(
              errors.map(
                (error): readonly [string, McapTopicDecodeDiagnostic] => [
                  [
                    error.code,
                    error.messageTimeNs,
                    error.payloadIdentity,
                    error.message,
                  ].join("\0"),
                  {
                    code: error.code,
                    message: error.message,
                    messageTimeNs: error.messageTimeNs,
                    payloadIdentity: error.payloadIdentity,
                    requestedTimeNs: timeNs,
                    topic,
                  },
                ],
              ),
            ).values(),
          ];
          onTopicSettlement?.({
            topic,
            window: {
              activeTimeline: timeline.id,
              decodeErrorsByTopic: { [topic]: decodeErrorsByTopic[topic] },
              endTimeNs: streamPolicies[topic].endTimeNs,
              messages: [],
              messagesByTopic: { [topic]: [] },
              startTimeNs: streamPolicies[topic].startTimeNs ?? 0n,
              streamPolicies: { [topic]: streamPolicies[topic] },
              timeNs,
            },
          });
          continue;
        }
        const decoded = settled
          .filter(
            (
              result,
            ): result is Extract<
              McapSettledTopicDecode<Message>,
              { readonly status: "decoded" }
            > => result.status === "decoded",
          )
          .map((result) => result.decoded);
        messagesByTopic[topic] = decoded;
        messages.push(...decoded);

        onTopicSettlement?.({
          topic,
          window: {
            activeTimeline: timeline.id,
            endTimeNs: streamPolicies[topic].endTimeNs,
            messages: decoded,
            messagesByTopic: { [topic]: decoded },
            startTimeNs: streamPolicies[topic].startTimeNs ?? 0n,
            streamPolicies: { [topic]: streamPolicies[topic] },
            timeNs,
          },
        });
      }

      messages.sort((left, right) => {
        const timelineOrder = compareBigInt(
          left.timelineTimeNs,
          right.timelineTimeNs,
        );
        return timelineOrder || left.topic.localeCompare(right.topic);
      });

      return {
        activeTimeline: timeline.id,
        ...(Object.keys(decodeErrorsByTopic).length > 0
          ? { decodeErrorsByTopic }
          : {}),
        endTimeNs: maxBigInt(
          Object.values(streamPolicies).map((policy) => policy.endTimeNs),
        ),
        messages,
        messagesByTopic,
        startTimeNs: minBigInt(
          Object.values(streamPolicies).map(
            (policy) => policy.startTimeNs ?? 0n,
          ),
        ),
        streamPolicies,
        timeNs,
      };
    }),
  );
}

export async function selectFirstSettlementTopic<Candidate>({
  estimateCandidateBytes,
  settlementPriorityTopics,
  selectedByTopic,
}: {
  readonly estimateCandidateBytes?: (
    candidate: Candidate,
  ) => number | Promise<number>;
  readonly settlementPriorityTopics?: readonly string[];
  readonly selectedByTopic: readonly (readonly [
    string,
    readonly Candidate[],
  ])[];
}): Promise<string | undefined> {
  if (!estimateCandidateBytes || !settlementPriorityTopics?.length) {
    return undefined;
  }
  const eligible = new Set(settlementPriorityTopics);
  const costs = await Promise.all(
    selectedByTopic
      .filter(([topic, selected]) => eligible.has(topic) && selected.length > 0)
      .map(async ([topic, selected]) => ({
        cost: (await Promise.all(selected.map(estimateCandidateBytes))).reduce(
          (total, bytes) => total + bytes,
          0,
        ),
        topic,
      })),
  );
  costs.sort(
    (left, right) =>
      left.cost - right.cost || left.topic.localeCompare(right.topic),
  );
  return costs[0]?.topic;
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

  // The index scan reads one small exact range per (chunk, channel),
  // serially — a line of round trips on remote transports. Awaiting the
  // pipelined region warm-up first turns those reads into cache hits.
  await reader.prefetchWindow?.({
    endTimeNs: indexedRequest.endTimeNs,
    includeChunkData: false,
    startTimeNs: indexedRequest.startTimeNs,
    topics: indexedRequest.topics,
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
    INDEXED_LOOKUP_KEY_SEPARATOR,
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
    const candidate = rawCandidateFromMessage({ message, reader, timeline });
    if (!isWithinRange(candidate.timelineTimeNs, startTimeNs, endTimeNs)) {
      continue;
    }

    const topicCandidates = candidates.get(candidate.topic) ?? [];
    topicCandidates.push(candidate);
    candidates.set(candidate.topic, topicCandidates);
  }

  return candidates;
}

function rawCandidateFromMessage({
  message,
  reader,
  timeline,
}: {
  readonly message: McapTypes.TypedMcapRecords["Message"];
  readonly reader: McapIndexedReaderLike;
  readonly timeline: McapTimelineStrategy;
}): McapRawMessageCandidate {
  const channel = reader.channelsById.get(message.channelId);
  if (!channel) {
    throw new Error(`Missing MCAP channel ${message.channelId}`);
  }

  return {
    channel,
    message,
    schema: reader.schemasById.get(channel.schemaId),
    timelineTimeNs: timeline.messageTimeNs(message),
    topic: channel.topic,
  };
}

async function decodeIndexedCandidate<
  ReusedMessage extends McapSynchronizedMessageIdentity,
>({
  candidate,
  decodeClient,
  indexedDecodeCache,
  rawDecodeCache,
  rawReadCache,
  reader,
  selectedRawCandidates,
  pointCloudColorBy,
  reusedIndexedMessages,
  signal,
  source,
  timeline,
}: {
  readonly candidate: McapIndexedMessageCandidate;
  readonly decodeClient: DecodeClient;
  readonly indexedDecodeCache: Map<
    string,
    Promise<McapDecodedMessage | ReusedMessage>
  >;
  readonly rawDecodeCache: McapRawDecodeCache;
  readonly rawReadCache: Map<
    string,
    Promise<readonly McapRawMessageCandidate[]>
  >;
  readonly reader: McapIndexedReaderLike;
  readonly selectedRawCandidates:
    | Promise<ReadonlyMap<McapIndexedMessageCandidate, McapRawMessageCandidate>>
    | undefined;
  readonly pointCloudColorBy?: string;
  readonly reusedIndexedMessages: ReadonlyMap<string, ReusedMessage>;
  readonly signal?: AbortSignal;
  readonly source: McapReadSynchronizedMessageBatchRequest["source"];
  readonly timeline: McapTimelineStrategy;
}): Promise<McapDecodedMessage | ReusedMessage> {
  const { physicalRecordIdentity, recordId } = indexedCandidateReuseIdentity({
    candidate,
    pointCloudColorBy,
    timeline,
  });
  let decoded = indexedDecodeCache.get(recordId);

  if (!decoded) {
    const reused = reusedIndexedMessages.get(recordId);
    decoded = reused
      ? Promise.resolve(reused)
      : resolveRawCandidateForIndexedMessage({
          candidate,
          rawReadCache,
          reader,
          selectedRawCandidates,
          timeline,
        })
          .then((rawCandidate) =>
            decodeRawCandidate({
              candidate: rawCandidate,
              decodeCache: rawDecodeCache,
              decodeClient,
              physicalRecordId: physicalRecordIdentity,
              pointCloudColorBy,
              signal,
              source,
              timeline,
            }),
          )
          .then((message) => ({ ...message, recordId }));
    indexedDecodeCache.set(recordId, decoded);
  }

  return decoded;
}

function indexedCandidateReuseIdentity({
  candidate,
  pointCloudColorBy,
  timeline,
}: {
  readonly candidate: McapIndexedMessageCandidate;
  readonly pointCloudColorBy?: string;
  readonly timeline: McapTimelineStrategy;
}) {
  const physicalRecordIdentity = indexedCandidateRecordId(candidate);
  return {
    physicalRecordIdentity,
    recordId: mintIndexedRecordIdentityFromPhysical(physicalRecordIdentity, {
      cacheKeySuffix: timeline.cacheKeySuffix,
      pointCloudColorBy,
    }),
    timelineTimeNs: candidate.timelineTimeNs,
    topic: candidate.topic,
  };
}

async function resolveRawCandidateForIndexedMessage({
  candidate,
  rawReadCache,
  reader,
  selectedRawCandidates,
  timeline,
}: {
  readonly candidate: McapIndexedMessageCandidate;
  readonly rawReadCache: Map<
    string,
    Promise<readonly McapRawMessageCandidate[]>
  >;
  readonly reader: McapIndexedReaderLike;
  readonly selectedRawCandidates:
    | Promise<ReadonlyMap<McapIndexedMessageCandidate, McapRawMessageCandidate>>
    | undefined;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapRawMessageCandidate> {
  if (selectedRawCandidates) {
    const rawCandidate = (await selectedRawCandidates).get(candidate);
    if (!rawCandidate) {
      throw missingIndexedMessageError(candidate);
    }
    return rawCandidate;
  }

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
      raw.message.logTime === candidate.logTimeNs,
  );
  if (matches.length === 0) {
    throw missingIndexedMessageError(candidate);
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

async function materializeIndexedSelection({
  candidates,
  reader,
  signal,
  timeline,
}: {
  readonly candidates: readonly McapIndexedMessageCandidate[];
  readonly reader: McapIndexedReaderLike;
  readonly signal?: AbortSignal;
  readonly timeline: McapTimelineStrategy;
}): Promise<ReadonlyMap<McapIndexedMessageCandidate, McapRawMessageCandidate>> {
  const readIndexedMessages = reader.readIndexedMessages;
  if (!readIndexedMessages || candidates.length === 0) {
    return new Map();
  }

  const entries = candidates.map(
    ({ channelId, chunkStartOffset, logTimeNs, messageOffset, topic }) => ({
      channelId,
      chunkStartOffset,
      logTimeNs,
      messageOffset,
      topic,
    }),
  );
  const messages = await materializeIndexedEntries(reader, entries, signal);

  return new Map(
    candidates.map((candidate, index) => {
      const message = messages[index];
      if (!message) {
        throw missingIndexedMessageError(candidate);
      }
      const rawCandidate = rawCandidateFromMessage({
        message,
        reader,
        timeline,
      });
      if (rawCandidate.topic !== candidate.topic) {
        throw new Error("MCAP message index/channel topic mismatch");
      }
      return [candidate, rawCandidate] as const;
    }),
  );
}

function missingIndexedMessageError(
  candidate: McapIndexedMessageCandidate,
): Error {
  return new Error(
    `Missing MCAP message for indexed ${candidate.topic} entry with channel ${
      candidate.channelId
    } at ${candidate.logTimeNs.toString()}`,
  );
}

function compareDuplicateRawMatches(
  left: McapRawMessageCandidate,
  right: McapRawMessageCandidate,
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
  physicalRecordId,
  pointCloudColorBy,
  signal,
  source,
  timeline,
}: {
  readonly candidate: McapRawMessageCandidate;
  readonly decodeCache: McapRawDecodeCache;
  readonly decodeClient: DecodeClient;
  readonly physicalRecordId?: string;
  readonly pointCloudColorBy?: string;
  readonly signal?: AbortSignal;
  readonly source: McapReadSynchronizedMessageBatchRequest["source"];
  readonly timeline: McapTimelineStrategy;
}): Promise<McapDecodedMessage> {
  let decodedByColor = decodeCache.get(candidate.message);
  if (!decodedByColor) {
    decodedByColor = new Map();
    decodeCache.set(candidate.message, decodedByColor);
  }

  const colorKey = pointCloudColorBy ?? "auto";
  let decoded = decodedByColor.get(colorKey);

  if (!decoded) {
    decoded = decodeMcapMessage({
      channel: candidate.channel,
      decodeClient,
      message: candidate.message,
      physicalRecordId,
      pointCloudColorBy,
      schema: candidate.schema,
      signal,
      source,
      timeline,
    });
    decodedByColor.set(colorKey, decoded);
  }

  return decoded;
}

function compareRawCandidateTieBreaker(
  left: McapRawMessageCandidate,
  right: McapRawMessageCandidate,
) {
  if (left.message.channelId !== right.message.channelId) {
    return left.message.channelId - right.message.channelId;
  }

  return left.message.sequence - right.message.sequence;
}

function compareIndexedCandidateTieBreaker(
  left: McapIndexedMessageCandidate,
  right: McapIndexedMessageCandidate,
) {
  if (left.channelId !== right.channelId) {
    return left.channelId - right.channelId;
  }

  const chunkComparison = compareBigInt(
    left.chunkStartOffset,
    right.chunkStartOffset,
  );
  if (chunkComparison !== 0) {
    return chunkComparison;
  }

  return compareBigInt(left.messageOffset, right.messageOffset);
}

function serializeIndexedLookupKey(candidate: McapIndexedMessageCandidate) {
  return [candidate.topic, candidate.logTimeNs.toString()].join(
    INDEXED_LOOKUP_KEY_SEPARATOR,
  );
}

function indexedCandidateRecordId(candidate: McapIndexedMessageTime) {
  return [
    candidate.topic,
    candidate.channelId.toString(),
    candidate.logTimeNs.toString(),
    candidate.chunkStartOffset.toString(),
    candidate.messageOffset.toString(),
  ].join(INDEXED_LOOKUP_KEY_SEPARATOR);
}
