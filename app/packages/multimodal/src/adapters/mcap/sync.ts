import { PlaybackSyncMode } from "../../schemas/v1";
import type {
  McapDecodedMessage,
  McapResolvedStreamSyncPolicy,
  McapStreamSyncPolicies,
  McapStreamSyncPolicy,
  McapSynchronizedMessageWindow,
  McapActiveTimeline,
} from "./types";

/**
 * Default tolerance for NEAREST-mode synchronized MCAP playback windows.
 */
export const DEFAULT_MCAP_SYNC_TOLERANCE_NS = 50_000_000n;

const DEFAULT_STREAM_SYNC_LIMIT = 1;

/**
 * Resolved sync bounds for every requested topic around one playback time.
 */
export interface McapWindowBounds {
  readonly timeNs: bigint;
  readonly streamPolicies: Readonly<
    Record<string, McapResolvedStreamSyncPolicy>
  >;
}

type SyncCandidate = {
  readonly timelineTimeNs: bigint;
  readonly topic: string;
};

type SyncCandidateTieBreaker<Candidate extends SyncCandidate> = (
  left: Candidate,
  right: Candidate,
) => number;

/**
 * Expands per-stream sync policy into concrete time bounds for one playback time.
 */
export function createWindowBounds({
  timeNs,
  defaultStreamPolicy,
  streamPolicies,
  topics,
}: {
  readonly timeNs: bigint;
  readonly defaultStreamPolicy?: McapStreamSyncPolicy;
  readonly streamPolicies?: McapStreamSyncPolicies;
  readonly topics: readonly string[];
}): McapWindowBounds {
  const resolved: Record<string, McapResolvedStreamSyncPolicy> = {};

  for (const topic of topics) {
    resolved[topic] = resolveStreamSyncPolicy(
      timeNs,
      streamPolicies?.[topic] ?? defaultStreamPolicy,
      topic,
    );
  }

  return {
    timeNs,
    streamPolicies: resolved,
  };
}

/**
 * Selects per-topic decoded messages and returns one synchronized playback window.
 */
export function selectSynchronizedWindow({
  timeNs,
  activeTimeline,
  candidatesByTopic,
  streamPolicies,
  topics,
}: {
  readonly timeNs: bigint;
  readonly activeTimeline: McapActiveTimeline;
  readonly candidatesByTopic: ReadonlyMap<
    string,
    readonly McapDecodedMessage[]
  >;
  readonly streamPolicies: Readonly<
    Record<string, McapResolvedStreamSyncPolicy>
  >;
  readonly topics: readonly string[];
}): McapSynchronizedMessageWindow {
  const messagesByTopic: Record<string, readonly McapDecodedMessage[]> = {};
  const messages: McapDecodedMessage[] = [];

  for (const topic of topics) {
    const selected = selectCandidatesForTopic(
      candidatesByTopic.get(topic) ?? [],
      timeNs,
      streamPolicies[topic],
    );
    messagesByTopic[topic] = selected;
    messages.push(...selected);
  }

  messages.sort(compareByTimelineTime);

  return {
    timeNs,
    activeTimeline,
    endTimeNs: maxBigInt(
      Object.values(streamPolicies).map((policy) => policy.endTimeNs),
    ),
    messages,
    messagesByTopic,
    startTimeNs: minBigInt(
<<<<<<< HEAD
      Object.values(streamPolicies).map((policy) => policy.startTimeNs ?? 0n),
=======
      Object.values(streamPolicies).map((policy) => policy.startTimeNs),
>>>>>>> main
    ),
    streamPolicies,
  };
}

/**
 * Returns whether a resolved policy selects with unbounded lookback —
 * the predecessor query the batch reader must backfill outside its
 * bounded scan window.
 */
export function isUnboundedLatestPolicy(
  policy: McapResolvedStreamSyncPolicy,
): boolean {
  return (
    policy.mode === PlaybackSyncMode.LATEST && policy.startTimeNs === undefined
  );
}

/**
 * Applies one resolved sync policy to choose candidate messages for a topic.
 */
export function selectCandidatesForTopic<Candidate extends SyncCandidate>(
  candidates: readonly Candidate[],
  timeNs: bigint,
  policy: McapResolvedStreamSyncPolicy | undefined,
  tieBreaker?: SyncCandidateTieBreaker<Candidate>,
): readonly Candidate[] {
  if (!policy) {
    throw new Error("Missing MCAP stream sync policy");
  }

  const inWindow = candidates.filter((candidate) =>
    isWithinRange(
      candidate.timelineTimeNs,
      policy.startTimeNs,
      policy.endTimeNs,
    ),
  );
  const compareByTime = (left: Candidate, right: Candidate) =>
    compareCandidateByTimelineTime(left, right, tieBreaker);

  switch (policy.mode) {
    case PlaybackSyncMode.NEAREST:
      return inWindow
        .sort((left, right) =>
          compareCandidateByDistance(left, right, timeNs, tieBreaker),
        )
        .slice(0, policy.limit)
        .sort(compareByTime);
    case PlaybackSyncMode.STRICT:
      return inWindow
        .filter((candidate) => candidate.timelineTimeNs === timeNs)
        .slice(0, policy.limit)
        .sort(compareByTime);
    case PlaybackSyncMode.LATEST:
      return inWindow
        .filter((candidate) => candidate.timelineTimeNs <= timeNs)
        .sort((left, right) => compareByTime(right, left))
        .slice(0, policy.limit)
        .sort(compareByTime);
  }

  throw new Error(`Unsupported playback sync mode ${policy.mode}`);
}

/**
 * Orders decoded MCAP messages by playback timeline time.
 */
export function compareByTimelineTime(
  left: McapDecodedMessage,
  right: McapDecodedMessage,
) {
  return compareCandidateByTimelineTime(left, right);
}

/**
 * Comparator for bigint timestamps.
 */
export function compareBigInt(left: bigint, right: bigint) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

/**
 * Returns whether a timestamp falls within optional inclusive bounds.
 */
export function isWithinRange(
  value: bigint,
  startTimeNs: bigint | undefined,
  endTimeNs: bigint | undefined,
) {
  return (
    (startTimeNs === undefined || value >= startTimeNs) &&
    (endTimeNs === undefined || value <= endTimeNs)
  );
}

/**
 * Returns the smallest bigint timestamp, failing on empty input.
 */
export function minBigInt(values: readonly bigint[]): bigint {
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

/**
 * Returns the largest bigint timestamp, failing on empty input.
 */
export function maxBigInt(values: readonly bigint[]): bigint {
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

function resolveStreamSyncPolicy(
  timeNs: bigint,
  policy: McapStreamSyncPolicy | undefined,
  topic: string,
): McapResolvedStreamSyncPolicy {
  const mode = normalizePlaybackSyncMode(policy?.mode);
  const limit = policy?.limit ?? DEFAULT_STREAM_SYNC_LIMIT;
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1) {
    throw new Error(
      `MCAP sync policy for ${topic} must request a positive integer frame limit`,
    );
  }

  switch (mode) {
    case PlaybackSyncMode.NEAREST: {
      const toleranceBeforeNs =
        policy?.toleranceBeforeNs ?? DEFAULT_MCAP_SYNC_TOLERANCE_NS;
      const toleranceAfterNs =
        policy?.toleranceAfterNs ?? DEFAULT_MCAP_SYNC_TOLERANCE_NS;
      assertNonNegativeTolerance(topic, "toleranceBeforeNs", toleranceBeforeNs);
      assertNonNegativeTolerance(topic, "toleranceAfterNs", toleranceAfterNs);

      return {
        endTimeNs: timeNs + toleranceAfterNs,
        limit,
        mode,
        startTimeNs: clampStartTime(timeNs - toleranceBeforeNs),
      };
    }
    case PlaybackSyncMode.STRICT:
      assertUnsupportedTolerance(topic, mode, "toleranceBeforeNs", policy);
      assertUnsupportedTolerance(topic, mode, "toleranceAfterNs", policy);

      return {
        endTimeNs: timeNs,
        limit,
        mode,
        startTimeNs: timeNs,
      };
    case PlaybackSyncMode.LATEST: {
      assertUnsupportedTolerance(topic, mode, "toleranceAfterNs", policy);

      // No tolerance means unbounded lookback: select the newest message
      // at or before the playback time, however old. Bounding happens at
      // the read layer (predecessor lookup), not here.
      const toleranceBeforeNs = policy?.toleranceBeforeNs;
      if (toleranceBeforeNs === undefined) {
        return {
          endTimeNs: timeNs,
          limit,
          mode,
        };
      }

      assertNonNegativeTolerance(topic, "toleranceBeforeNs", toleranceBeforeNs);
      return {
        endTimeNs: timeNs,
        limit,
        mode,
        startTimeNs: clampStartTime(timeNs - toleranceBeforeNs),
      };
    }
  }
}

function normalizePlaybackSyncMode(
  mode: PlaybackSyncMode | undefined,
):
  | PlaybackSyncMode.NEAREST
  | PlaybackSyncMode.STRICT
  | PlaybackSyncMode.LATEST {
  // Playback defaults to "newest at or before the playhead" — NEAREST can
  // select future data, which reads as misleading during playback.
  if (mode === undefined || mode === PlaybackSyncMode.UNSPECIFIED) {
    return PlaybackSyncMode.LATEST;
  }

  if (
    mode === PlaybackSyncMode.NEAREST ||
    mode === PlaybackSyncMode.STRICT ||
    mode === PlaybackSyncMode.LATEST
  ) {
    return mode;
  }

  throw new Error(`Unsupported playback sync mode ${mode}`);
}

function assertNonNegativeTolerance(
  topic: string,
  field: "toleranceAfterNs" | "toleranceBeforeNs",
  value: bigint,
) {
  if (value < 0n) {
    throw new Error(
      `MCAP sync policy ${field} for ${topic} cannot be negative`,
    );
  }
}

function assertUnsupportedTolerance(
  topic: string,
  mode: PlaybackSyncMode,
  field: "toleranceAfterNs" | "toleranceBeforeNs",
  policy: McapStreamSyncPolicy | undefined,
) {
  const value = policy?.[field];
  if (value !== undefined && value !== 0n) {
    throw new Error(
      `MCAP sync policy ${field} for ${topic} is not valid for ${PlaybackSyncMode[mode]}`,
    );
  }
}

function compareCandidateByDistance<Candidate extends SyncCandidate>(
  left: Candidate,
  right: Candidate,
  timeNs: bigint,
  tieBreaker?: SyncCandidateTieBreaker<Candidate>,
) {
  const leftDistance = absBigInt(left.timelineTimeNs - timeNs);
  const rightDistance = absBigInt(right.timelineTimeNs - timeNs);

  if (leftDistance === rightDistance) {
    return compareCandidateByTimelineTime(left, right, tieBreaker);
  }

  return leftDistance < rightDistance ? -1 : 1;
}

function compareCandidateByTimelineTime<Candidate extends SyncCandidate>(
  left: Candidate,
  right: Candidate,
  tieBreaker?: SyncCandidateTieBreaker<Candidate>,
) {
  if (left.timelineTimeNs !== right.timelineTimeNs) {
    return left.timelineTimeNs < right.timelineTimeNs ? -1 : 1;
  }

  const topicOrder = left.topic.localeCompare(right.topic);
  if (topicOrder !== 0) {
    return topicOrder;
  }

  return tieBreaker?.(left, right) ?? 0;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function clampStartTime(value: bigint): bigint {
  return value < 0n ? 0n : value;
}
