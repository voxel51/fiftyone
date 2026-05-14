import { PlaybackSyncMode } from "../schemas/v1";
import type {
  McapDecodedMessage,
  McapResolvedStreamSyncPolicy,
  McapStreamSyncPolicies,
  McapStreamSyncPolicy,
  McapSynchronizedMessageWindow,
  McapTimestampSource,
} from "./types";

/**
 * Default tolerance for synchronized MCAP playback windows.
 */
export const DEFAULT_MCAP_SYNC_TOLERANCE_NS = 50_000_000n;

/**
 * Resolved sync bounds for every requested topic around one anchor time.
 */
export interface McapWindowBounds {
  readonly anchorTimeNs: bigint;
  readonly streamPolicies: Readonly<
    Record<string, McapResolvedStreamSyncPolicy>
  >;
}

type SyncCandidate = {
  readonly syncTimeNs: bigint;
  readonly topic: string;
};

type SyncCandidateTieBreaker<Candidate extends SyncCandidate> = (
  left: Candidate,
  right: Candidate
) => number;

/**
 * Expands per-stream sync policy into concrete time bounds for one anchor.
 */
export function createWindowBounds({
  anchorTimeNs,
  defaultStreamPolicy,
  streamPolicies,
  topics,
}: {
  readonly anchorTimeNs: bigint;
  readonly defaultStreamPolicy?: McapStreamSyncPolicy;
  readonly streamPolicies?: McapStreamSyncPolicies;
  readonly topics: readonly string[];
}): McapWindowBounds {
  const resolved: Record<string, McapResolvedStreamSyncPolicy> = {};

  for (const topic of topics) {
    resolved[topic] = resolveStreamSyncPolicy(
      anchorTimeNs,
      streamPolicies?.[topic] ?? defaultStreamPolicy,
      topic
    );
  }

  return {
    anchorTimeNs,
    streamPolicies: resolved,
  };
}

/**
 * Selects per-topic decoded messages and returns one synchronized playback window.
 */
export function selectSynchronizedWindow({
  anchorTimeNs,
  candidatesByTopic,
  streamPolicies,
  timestampSource,
  topics,
}: {
  readonly anchorTimeNs: bigint;
  readonly candidatesByTopic: ReadonlyMap<
    string,
    readonly McapDecodedMessage[]
  >;
  readonly streamPolicies: Readonly<
    Record<string, McapResolvedStreamSyncPolicy>
  >;
  readonly timestampSource: McapTimestampSource;
  readonly topics: readonly string[];
}): McapSynchronizedMessageWindow {
  const messagesByTopic: Record<string, readonly McapDecodedMessage[]> = {};
  const messages: McapDecodedMessage[] = [];

  for (const topic of topics) {
    const selected = selectCandidatesForTopic(
      candidatesByTopic.get(topic) ?? [],
      anchorTimeNs,
      streamPolicies[topic]
    );
    messagesByTopic[topic] = selected;
    messages.push(...selected);
  }

  messages.sort(compareBySyncTime);

  return {
    anchorTimeNs,
    endTimeNs: maxBigInt(
      Object.values(streamPolicies).map((policy) => policy.endTimeNs)
    ),
    messages,
    messagesByTopic,
    startTimeNs: minBigInt(
      Object.values(streamPolicies).map((policy) => policy.startTimeNs)
    ),
    streamPolicies,
    timestampSource,
  };
}

/**
 * Applies one resolved sync policy to choose candidate messages for a topic.
 */
export function selectCandidatesForTopic<Candidate extends SyncCandidate>(
  candidates: readonly Candidate[],
  anchorTimeNs: bigint,
  policy: McapResolvedStreamSyncPolicy | undefined,
  tieBreaker?: SyncCandidateTieBreaker<Candidate>
): readonly Candidate[] {
  if (!policy) {
    throw new Error("Missing MCAP stream sync policy");
  }

  const inWindow = candidates.filter((candidate) =>
    isWithinRange(candidate.syncTimeNs, policy.startTimeNs, policy.endTimeNs)
  );
  const compareByTime = (left: Candidate, right: Candidate) =>
    compareCandidateBySyncTime(left, right, tieBreaker);

  switch (policy.mode) {
    case PlaybackSyncMode.NEAREST:
      return inWindow
        .sort((left, right) =>
          compareCandidateByDistance(left, right, anchorTimeNs, tieBreaker)
        )
        .slice(0, policy.limit)
        .sort(compareByTime);
    case PlaybackSyncMode.STRICT:
      return inWindow
        .filter((candidate) => candidate.syncTimeNs === anchorTimeNs)
        .slice(0, policy.limit)
        .sort(compareByTime);
    case PlaybackSyncMode.LATEST:
      return inWindow
        .filter((candidate) => candidate.syncTimeNs <= anchorTimeNs)
        .sort((left, right) => compareByTime(right, left))
        .slice(0, policy.limit)
        .sort(compareByTime);
  }

  throw new Error(`Unsupported playback sync mode ${policy.mode}`);
}

/**
 * Orders decoded MCAP messages by playback sync time.
 */
export function compareBySyncTime(
  left: McapDecodedMessage,
  right: McapDecodedMessage
) {
  return compareCandidateBySyncTime(left, right);
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
  endTimeNs: bigint | undefined
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
  anchorTimeNs: bigint,
  policy: McapStreamSyncPolicy | undefined,
  topic: string
): McapResolvedStreamSyncPolicy {
  const mode = normalizePlaybackSyncMode(policy?.mode);
  const limit = policy?.limit ?? 1;
  if (limit < 1) {
    throw new Error(
      `MCAP sync policy for ${topic} must request at least one frame`
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
        endTimeNs: anchorTimeNs + toleranceAfterNs,
        limit,
        mode,
        startTimeNs: clampStartTime(anchorTimeNs - toleranceBeforeNs),
      };
    }
    case PlaybackSyncMode.STRICT:
      assertUnsupportedTolerance(topic, mode, "toleranceBeforeNs", policy);
      assertUnsupportedTolerance(topic, mode, "toleranceAfterNs", policy);

      return {
        endTimeNs: anchorTimeNs,
        limit,
        mode,
        startTimeNs: anchorTimeNs,
      };
    case PlaybackSyncMode.LATEST: {
      const toleranceBeforeNs =
        policy?.toleranceBeforeNs ?? DEFAULT_MCAP_SYNC_TOLERANCE_NS;
      assertNonNegativeTolerance(topic, "toleranceBeforeNs", toleranceBeforeNs);
      assertUnsupportedTolerance(topic, mode, "toleranceAfterNs", policy);

      return {
        endTimeNs: anchorTimeNs,
        limit,
        mode,
        startTimeNs: clampStartTime(anchorTimeNs - toleranceBeforeNs),
      };
    }
  }
}

function normalizePlaybackSyncMode(
  mode: PlaybackSyncMode | undefined
):
  | PlaybackSyncMode.NEAREST
  | PlaybackSyncMode.STRICT
  | PlaybackSyncMode.LATEST {
  if (mode === undefined || mode === PlaybackSyncMode.UNSPECIFIED) {
    return PlaybackSyncMode.NEAREST;
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
  value: bigint
) {
  if (value < 0n) {
    throw new Error(
      `MCAP sync policy ${field} for ${topic} cannot be negative`
    );
  }
}

function assertUnsupportedTolerance(
  topic: string,
  mode: PlaybackSyncMode,
  field: "toleranceAfterNs" | "toleranceBeforeNs",
  policy: McapStreamSyncPolicy | undefined
) {
  const value = policy?.[field];
  if (value !== undefined && value !== 0n) {
    throw new Error(
      `MCAP sync policy ${field} for ${topic} is not valid for ${PlaybackSyncMode[mode]}`
    );
  }
}

function compareCandidateByDistance<Candidate extends SyncCandidate>(
  left: Candidate,
  right: Candidate,
  anchorTimeNs: bigint,
  tieBreaker?: SyncCandidateTieBreaker<Candidate>
) {
  const leftDistance = absBigInt(left.syncTimeNs - anchorTimeNs);
  const rightDistance = absBigInt(right.syncTimeNs - anchorTimeNs);

  if (leftDistance === rightDistance) {
    return compareCandidateBySyncTime(left, right, tieBreaker);
  }

  return leftDistance < rightDistance ? -1 : 1;
}

function compareCandidateBySyncTime<Candidate extends SyncCandidate>(
  left: Candidate,
  right: Candidate,
  tieBreaker?: SyncCandidateTieBreaker<Candidate>
) {
  if (left.syncTimeNs !== right.syncTimeNs) {
    return left.syncTimeNs < right.syncTimeNs ? -1 : 1;
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
