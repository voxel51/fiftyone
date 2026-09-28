import {
  STREAM_SYNC_MODE,
  type DecodedFrame,
  type EpisodeManifest,
  type ResolvedStreamSyncPolicy,
  type StreamDescriptor,
  type StreamSyncMode,
  type StreamSyncPolicies,
  type StreamSyncPolicy,
  type SynchronizedFrameWindow,
} from "../ir";

/** Default symmetric tolerance for nearest-frame presentation. */
export const DEFAULT_EPISODE_SYNC_TOLERANCE_NS = 50_000_000n;

const DEFAULT_STREAM_SYNC_LIMIT = 1;

/** Read bounds and per-stream policies resolved for one playhead target. */
export interface ResolvedPlaybackWindow {
  readonly endNs: bigint;
  readonly startNs: bigint;
  readonly streamPolicies: Readonly<Record<string, ResolvedStreamSyncPolicy>>;
  readonly timeNs: bigint;
}

/** Format-neutral request used to derive a synchronized playback window. */
export interface PlaybackWindowRequest {
  readonly defaultStreamPolicy?: StreamSyncPolicy;
  readonly streamPolicies?: StreamSyncPolicies;
  readonly streams: readonly string[];
  readonly timeNs: bigint;
}

/** Places requested priority streams first without duplicating stream ids. */
export function prioritizedStreams(
  streams: readonly string[],
  priorityStreams: readonly string[] | undefined,
): string[] {
  const requested = new Set(streams);
  if (!priorityStreams?.length) return [...requested];
  const priority = [...new Set(priorityStreams)].filter((stream) =>
    requested.has(stream),
  );
  const prioritized = new Set(priority);
  return [
    ...priority,
    ...[...requested].filter((stream) => !prioritized.has(stream)),
  ];
}

/** Resolves one read window from manifest bounds and stream sync policies. */
export function resolvePlaybackWindow(
  manifestStartNs: bigint,
  streamsById: ReadonlyMap<string, StreamDescriptor>,
  request: PlaybackWindowRequest,
): ResolvedPlaybackWindow {
  const streamPolicies = Object.fromEntries(
    request.streams.map((stream) => [
      stream,
      resolveStreamSyncPolicy(
        request.timeNs,
        request.streamPolicies?.[stream] ?? request.defaultStreamPolicy,
        stream,
      ),
    ]),
  );
  const policies = Object.values(streamPolicies);
  return {
    endNs:
      policies.length > 0
        ? maxBigInt(policies.map((policy) => policy.endNs))
        : request.timeNs,
    startNs:
      policies.length > 0
        ? minBigInt(
            request.streams.map((stream) =>
              readStartForPolicy(
                manifestStartNs,
                streamsById,
                stream,
                streamPolicies[stream],
              ),
            ),
          )
        : request.timeNs,
    streamPolicies,
    timeNs: request.timeNs,
  };
}

/** Selects and orders the frames that satisfy a resolved playback window. */
export function selectPlaybackWindow(
  candidatesByStream: ReadonlyMap<string, readonly DecodedFrame[]>,
  streams: readonly string[],
  sourceNames: ReadonlyMap<string, string>,
  window: ResolvedPlaybackWindow,
): SynchronizedFrameWindow {
  const framesByStream: Record<string, readonly DecodedFrame[]> = {};
  const frames: DecodedFrame[] = [];
  for (const stream of streams) {
    const selected = selectFrames(
      candidatesByStream.get(stream) ?? [],
      window.timeNs,
      window.streamPolicies[stream],
    );
    framesByStream[stream] = selected;
    frames.push(...selected);
  }
  frames.sort((left, right) => compareFrames(sourceNames, left, right));
  return {
    endNs: window.endNs,
    frames,
    framesByStream,
    startNs: window.startNs,
    streamPolicies: window.streamPolicies,
    timeNs: window.timeNs,
  };
}

/** Reads manifest time bounds for the requested streams in request order. */
export function streamTimeBoundsFromManifest(
  manifest: EpisodeManifest,
  streams: readonly string[],
) {
  const byId = new Map(manifest.streams.map((stream) => [stream.id, stream]));
  return streams.map((streamId) => {
    const stream = byId.get(streamId);
    return {
      firstTimestampNs: stream?.timeRange.startNs ?? null,
      lastTimestampNs: stream?.timeRange.endNs ?? null,
      streamId,
    };
  });
}

/** Resolves an explicit or manifest-derived read start for one stream. */
export function readStartForPolicy(
  manifestStartNs: bigint,
  streamsById: ReadonlyMap<string, StreamDescriptor>,
  streamId: string,
  policy: ResolvedStreamSyncPolicy,
): bigint {
  if (policy.startNs !== undefined) return policy.startNs;
  return streamsById.get(streamId)?.timeRange.startNs ?? manifestStartNs;
}

/** Creates a synchronized window with no selected frames. */
export function emptyPlaybackWindow(timeNs: bigint): SynchronizedFrameWindow {
  return {
    endNs: timeNs,
    frames: [],
    framesByStream: {},
    startNs: timeNs,
    streamPolicies: {},
    timeNs,
  };
}

function resolveStreamSyncPolicy(
  timeNs: bigint,
  policy: StreamSyncPolicy | undefined,
  stream: string,
): ResolvedStreamSyncPolicy {
  const mode = policy?.mode ?? STREAM_SYNC_MODE.LATEST;
  const limit = policy?.limit ?? DEFAULT_STREAM_SYNC_LIMIT;
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1) {
    throw new Error(
      `Episode sync policy for ${stream} must request a positive integer frame limit`,
    );
  }

  switch (mode) {
    case STREAM_SYNC_MODE.NEAREST: {
      const toleranceBeforeNs =
        policy?.toleranceBeforeNs ?? DEFAULT_EPISODE_SYNC_TOLERANCE_NS;
      const toleranceAfterNs =
        policy?.toleranceAfterNs ?? DEFAULT_EPISODE_SYNC_TOLERANCE_NS;
      assertNonNegativeTolerance(
        stream,
        "toleranceBeforeNs",
        toleranceBeforeNs,
      );
      assertNonNegativeTolerance(stream, "toleranceAfterNs", toleranceAfterNs);
      return {
        endNs: timeNs + toleranceAfterNs,
        limit,
        mode,
        startNs: clampStartTime(timeNs - toleranceBeforeNs),
      };
    }
    case STREAM_SYNC_MODE.STRICT:
      assertUnsupportedTolerance(stream, mode, "toleranceBeforeNs", policy);
      assertUnsupportedTolerance(stream, mode, "toleranceAfterNs", policy);
      return { endNs: timeNs, limit, mode, startNs: timeNs };
    case STREAM_SYNC_MODE.LATEST: {
      assertUnsupportedTolerance(stream, mode, "toleranceAfterNs", policy);
      const toleranceBeforeNs = policy?.toleranceBeforeNs;
      if (toleranceBeforeNs === undefined) {
        return { endNs: timeNs, limit, mode };
      }
      assertNonNegativeTolerance(
        stream,
        "toleranceBeforeNs",
        toleranceBeforeNs,
      );
      return {
        endNs: timeNs,
        limit,
        mode,
        startNs: clampStartTime(timeNs - toleranceBeforeNs),
      };
    }
  }
}

function selectFrames(
  candidates: readonly DecodedFrame[],
  timeNs: bigint,
  policy: ResolvedStreamSyncPolicy,
): readonly DecodedFrame[] {
  const inWindow = candidates.filter(
    (frame) =>
      (policy.startNs === undefined || frame.timestampNs >= policy.startNs) &&
      frame.timestampNs <= policy.endNs,
  );
  const chronological = (left: DecodedFrame, right: DecodedFrame) =>
    compareFramesByTime(left, right);

  switch (policy.mode) {
    case STREAM_SYNC_MODE.NEAREST:
      return [...inWindow]
        .sort((left, right) => {
          const distance =
            absBigInt(left.timestampNs - timeNs) -
            absBigInt(right.timestampNs - timeNs);
          return distance < 0n
            ? -1
            : distance > 0n
              ? 1
              : chronological(left, right);
        })
        .slice(0, policy.limit)
        .sort(chronological);
    case STREAM_SYNC_MODE.STRICT:
      return [...inWindow].sort(chronological).slice(0, policy.limit);
    case STREAM_SYNC_MODE.LATEST:
      return [...inWindow]
        .filter((frame) => frame.timestampNs <= timeNs)
        .sort((left, right) => chronological(right, left))
        .slice(0, policy.limit)
        .sort(chronological);
  }
}

function compareFrames(
  sourceNames: ReadonlyMap<string, string>,
  left: DecodedFrame,
  right: DecodedFrame,
): number {
  const timeOrder = compareFramesByTime(left, right);
  if (timeOrder !== 0) return timeOrder;
  return (sourceNames.get(left.streamId) ?? left.streamId).localeCompare(
    sourceNames.get(right.streamId) ?? right.streamId,
  );
}

function compareFramesByTime(left: DecodedFrame, right: DecodedFrame): number {
  if (left.timestampNs !== right.timestampNs) {
    return left.timestampNs < right.timestampNs ? -1 : 1;
  }
  return (left.sequence ?? 0) - (right.sequence ?? 0);
}

function assertNonNegativeTolerance(
  stream: string,
  field: "toleranceAfterNs" | "toleranceBeforeNs",
  value: bigint,
): void {
  if (value < 0n) {
    throw new Error(
      `Episode sync policy ${field} for ${stream} cannot be negative`,
    );
  }
}

function assertUnsupportedTolerance(
  stream: string,
  mode: StreamSyncMode,
  field: "toleranceAfterNs" | "toleranceBeforeNs",
  policy: StreamSyncPolicy | undefined,
): void {
  const value = policy?.[field];
  if (value !== undefined && value !== 0n) {
    throw new Error(
      `Episode sync policy ${field} for ${stream} is not valid for ${mode}`,
    );
  }
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function clampStartTime(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

function maxBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) throw new Error("Expected at least one time value");
  return values.reduce((maximum, value) => (value > maximum ? value : maximum));
}

function minBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) throw new Error("Expected at least one time value");
  return values.reduce((minimum, value) => (value < minimum ? value : minimum));
}
