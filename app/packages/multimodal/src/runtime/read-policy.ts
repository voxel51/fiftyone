import {
  STREAM_KIND,
  STREAM_SYNC_MODE,
  type DecodedFrame,
  type EpisodeManifest,
  type ResolvedStreamSyncPolicy,
  type StreamDescriptor,
  type StreamSyncMode,
  type StreamSyncPolicy,
  type SynchronizedFrameWindow,
  type TransformSample,
} from "../ir";
import type {
  EpisodeSession,
  FrameBatch,
  PlaybackReadCapability,
  ReadRequest,
  SynchronizedPlaybackBatchReadRequest,
  SynchronizedPlaybackReadOptions,
  SynchronizedPlaybackReadRequest,
  TransformReadAcceleration,
} from "../ports";
import { EpisodeReadUnsupportedError } from "../ports";
import { maxBigInt, minBigInt } from "../utils/bigint";
import { throwIfAborted } from "../utils/cancellation";

/** Default symmetric tolerance for nearest-frame presentation. */
export const DEFAULT_EPISODE_SYNC_TOLERANCE_NS = 50_000_000n;

const DEFAULT_STREAM_SYNC_LIMIT = 1;

/** Complete decoded messages admitted per stream for one generic playback batch. */
export const GENERIC_PLAYBACK_FALLBACK_MAX_MESSAGES_PER_STREAM = 1_024;

/** Complete decoded messages admitted per stream for one generic transform read. */
export const GENERIC_TRANSFORM_FALLBACK_MAX_MESSAGES_PER_STREAM = 256;

/** Collects one pull-based session read without changing adapter semantics. */
export async function readFrameBatches(
  session: EpisodeSession,
  request: ReadRequest,
): Promise<readonly FrameBatch[]> {
  const batches: FrameBatch[] = [];
  for await (const batch of session.read(request)) batches.push(batch);
  return batches;
}

/**
 * Runtime-owned synchronized-read fallback. Adapters may accelerate this exact
 * operation, but presentation code never forks on capability presence.
 */
export function readSynchronizedFallback(
  session: EpisodeSession,
  request: ReadRequest,
): Promise<readonly FrameBatch[]> {
  return readFrameBatches(session, request);
}

/** Reads a synchronized window through an equivalent fast path when present. */
export function readSynchronizedWindow(
  session: EpisodeSession,
  request: ReadRequest,
): Promise<readonly FrameBatch[]> {
  return (
    session.synchronizedRead?.readSynchronized(request) ??
    readSynchronizedFallback(session, request)
  );
}

/** Runtime-owned transform assembly fallback over ordinary frame reads. */
export async function readTransformsFallback(
  session: EpisodeSession,
  request: ReadRequest,
): Promise<readonly TransformSample[]> {
  const streams =
    request.streams.length > 0
      ? request.streams
      : session.manifest.streams
          .filter((stream) => stream.kind === STREAM_KIND.TRANSFORM)
          .map((stream) => stream.id);
  const batches = await readCompleteBoundedStreams({
    maxMessagesPerStream: GENERIC_TRANSFORM_FALLBACK_MAX_MESSAGES_PER_STREAM,
    operation: "generic-transform-fallback",
    priority: request.priority,
    session,
    signal: request.signal,
    streams,
    windowForStream: () => request.window,
  });
  return batches
    .flatMap((batch) =>
      batch.frames.flatMap((frame) => frame.output.transforms ?? []),
    )
    .sort(compareTransforms);
}

/** Reads transforms through an equivalent adapter fast path when present. */
export function readTransformWindow(
  session: EpisodeSession,
  request: ReadRequest,
): Promise<readonly TransformSample[]> {
  return (
    session.transformRead?.readTransforms(request) ??
    readTransformsFallback(session, request)
  );
}

/**
 * Creates the playback data plane every renderer consumes. Optional adapter
 * methods remain accelerations; the mandatory session surface is sufficient.
 */
export function createEpisodePlaybackRuntime(
  session: EpisodeSession,
): PlaybackReadCapability {
  const acceleration = session.playback;
  const subscribeTransport = acceleration?.subscribeTransport;
  return {
    timeline: acceleration?.timeline ?? {
      endNs: session.manifest.timeRange.endNs,
      startNs: session.manifest.timeRange.startNs,
      timeDomainId: session.manifest.timeDomain.id,
    },
    readStreamTimeBounds: (streams) =>
      acceleration?.readStreamTimeBounds(streams) ??
      Promise.resolve(streamTimeBoundsFromManifest(session.manifest, streams)),
    readSynchronized: (request) =>
      acceleration?.readSynchronized(request) ??
      readSynchronizedPlaybackFallback(session, request),
    readSynchronizedBatch: (request, options) =>
      acceleration?.readSynchronizedBatch(request, options) ??
      readSynchronizedPlaybackBatchFallback(session, request, options),
    ...(subscribeTransport
      ? { subscribeTransport: (listener) => subscribeTransport(listener) }
      : {}),
  };
}

/** Provides transform reads to views even when no adapter acceleration exists. */
export function createEpisodeTransformReadRuntime(
  session: EpisodeSession,
): TransformReadAcceleration {
  const acceleration = session.transformRead;
  const readPlacement = acceleration?.readPlacement;
  return {
    readBootstrap: (options) =>
      acceleration?.readBootstrap?.(options) ??
      readTransformBootstrapFallback(session, options?.signal),
    ...(readPlacement ? { readPlacement } : {}),
    readTransforms: (request) => readTransformWindow(session, request),
  };
}

/** Reads timeless transforms from mandatory transform streams. */
export async function readTransformBootstrapFallback(
  session: EpisodeSession,
  signal?: AbortSignal,
): Promise<readonly TransformSample[]> {
  const streams = session.manifest.streams
    .filter((stream) => stream.kind === STREAM_KIND.TRANSFORM)
    .map((stream) => stream.id);
  if (streams.length === 0) return [];

  const samples = await readTransformsFallback(session, {
    priority: "current",
    signal,
    streams,
    window: session.manifest.timeRange,
  });
  return samples.filter((sample) => sample.timestampNs === undefined);
}

/** Emulates one synchronized presentation window over mandatory `read()`. */
export async function readSynchronizedPlaybackFallback(
  session: EpisodeSession,
  request: SynchronizedPlaybackReadRequest,
): Promise<SynchronizedFrameWindow> {
  const windows = await readSynchronizedPlaybackBatchFallback(
    session,
    { ...request, timeNs: [request.timeNs] },
    { priority: "current", signal: request.signal },
  );
  return windows[0] ?? emptyPlaybackWindow(request.timeNs);
}

/** Emulates batched playback selection with runtime-owned sampling policy. */
export async function readSynchronizedPlaybackBatchFallback(
  session: EpisodeSession,
  request: SynchronizedPlaybackBatchReadRequest,
  options: SynchronizedPlaybackReadOptions = {},
): Promise<readonly SynchronizedFrameWindow[]> {
  if (request.timeNs.length === 0) return [];
  if (request.streams.length === 0) {
    return request.timeNs.map(emptyPlaybackWindow);
  }

  const streamsById = new Map(
    session.manifest.streams.map((stream) => [stream.id, stream]),
  );
  const resolved = request.timeNs.map((timeNs) =>
    resolvePlaybackWindow(session.manifest.timeRange.startNs, streamsById, {
      ...request,
      timeNs,
    }),
  );
  const batches = await readCompleteBoundedStreams({
    maxMessagesPerStream: GENERIC_PLAYBACK_FALLBACK_MAX_MESSAGES_PER_STREAM,
    operation: "generic-playback-fallback",
    priority: options.priority,
    session,
    signal: options.signal,
    streams: request.streams,
    windowForStream: (stream) => ({
      endNs: maxBigInt(resolved.map((window) => window.endNs)),
      startNs: minBigInt(
        resolved.map((window) =>
          readStartForPolicy(
            session.manifest.timeRange.startNs,
            streamsById,
            stream,
            window.streamPolicies[stream],
          ),
        ),
      ),
    }),
  });
  const framesByStream = collectFramesByStream(batches, request.streams);
  const sourceNames = new Map(
    session.manifest.streams.map((stream) => [stream.id, stream.sourceName]),
  );
  return resolved.map((window) =>
    selectPlaybackWindow(framesByStream, request.streams, sourceNames, window),
  );
}

async function readCompleteBoundedStreams({
  maxMessagesPerStream,
  operation,
  priority,
  session,
  signal,
  streams,
  windowForStream,
}: {
  readonly maxMessagesPerStream: number;
  readonly operation: string;
  readonly priority: ReadRequest["priority"];
  readonly session: EpisodeSession;
  readonly signal?: AbortSignal;
  readonly streams: readonly string[];
  readonly windowForStream: (stream: string) => ReadRequest["window"];
}): Promise<readonly FrameBatch[]> {
  const batches: FrameBatch[] = [];
  for (const stream of streams) {
    throwIfAborted(signal);
    let messageCount = 0;
    for await (const batch of session.read({
      // The extra message is a completeness probe. It is never published.
      limit: maxMessagesPerStream + 1,
      priority,
      signal,
      streams: [stream],
      window: windowForStream(stream),
    })) {
      const admitted: DecodedFrame[] = [];
      for (const frame of batch.frames) {
        throwIfAborted(signal);
        if (frame.streamId !== stream) continue;
        messageCount += 1;
        if (messageCount > maxMessagesPerStream) {
          throw new EpisodeReadUnsupportedError(
            operation,
            `${operation} requires more than ${maxMessagesPerStream} messages for ${stream}; a predecessor-aware or bounded accelerated capability is required`,
          );
        }
        admitted.push(frame);
      }
      if (admitted.length > 0) batches.push({ frames: admitted, stream });
    }
  }
  return batches;
}

interface ResolvedPlaybackWindow {
  readonly endNs: bigint;
  readonly startNs: bigint;
  readonly streamPolicies: Readonly<Record<string, ResolvedStreamSyncPolicy>>;
  readonly timeNs: bigint;
}

function resolvePlaybackWindow(
  manifestStartNs: bigint,
  streamsById: ReadonlyMap<string, StreamDescriptor>,
  request: SynchronizedPlaybackReadRequest,
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

function selectPlaybackWindow(
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
      return inWindow.slice(0, policy.limit).sort(chronological);
    case STREAM_SYNC_MODE.LATEST:
      return [...inWindow]
        .filter((frame) => frame.timestampNs <= timeNs)
        .sort((left, right) => chronological(right, left))
        .slice(0, policy.limit)
        .sort(chronological);
  }
}

function collectFramesByStream(
  batches: readonly FrameBatch[],
  streams: readonly string[],
): ReadonlyMap<string, readonly DecodedFrame[]> {
  const requested = new Set(streams);
  const collected = new Map<string, DecodedFrame[]>(
    streams.map((stream) => [stream, []]),
  );
  for (const batch of batches) {
    if (!requested.has(batch.stream)) continue;
    const frames = collected.get(batch.stream);
    if (!frames) continue;
    for (const frame of batch.frames) {
      if (frame.streamId === batch.stream) frames.push(frame);
    }
  }
  for (const frames of collected.values()) frames.sort(compareFramesByTime);
  return collected;
}

function streamTimeBoundsFromManifest(
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

function readStartForPolicy(
  manifestStartNs: bigint,
  streamsById: ReadonlyMap<string, StreamDescriptor>,
  streamId: string,
  policy: ResolvedStreamSyncPolicy,
): bigint {
  if (policy.startNs !== undefined) return policy.startNs;
  return streamsById.get(streamId)?.timeRange.startNs ?? manifestStartNs;
}

function emptyPlaybackWindow(timeNs: bigint): SynchronizedFrameWindow {
  return {
    endNs: timeNs,
    frames: [],
    framesByStream: {},
    startNs: timeNs,
    streamPolicies: {},
    timeNs,
  };
}

function compareTransforms(
  left: TransformSample,
  right: TransformSample,
): number {
  const leftTimeNs = left.timestampNs ?? -1n;
  const rightTimeNs = right.timestampNs ?? -1n;
  return leftTimeNs < rightTimeNs ? -1 : leftTimeNs > rightTimeNs ? 1 : 0;
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
