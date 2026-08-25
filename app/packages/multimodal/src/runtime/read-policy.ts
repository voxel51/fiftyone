import {
  STREAM_KIND,
  type DecodedFrame,
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
import {
  emptyPlaybackWindow,
  prioritizedStreams,
  readStartForPolicy,
  resolvePlaybackWindow,
  selectPlaybackWindow,
  streamTimeBoundsFromManifest,
} from "../stream-selection/playback";
import { maxBigInt, minBigInt } from "../utils/bigint";
import { throwIfAborted } from "../utils/cancellation";

export { DEFAULT_EPISODE_SYNC_TOLERANCE_NS } from "../stream-selection/playback";

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
  const subscribeTransport =
    acceleration?.subscribeTransport?.bind(acceleration);
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
  const readPlacement = acceleration?.readPlacement?.bind(acceleration);
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
    {
      onStreamSettlement: request.onStreamSettlement,
      onStreamSettlements: request.onStreamSettlements,
      settlementPriorityStreams: request.settlementPriorityStreams,
    },
  );
  return windows[0] ?? emptyPlaybackWindow(request.timeNs);
}

/** Emulates batched playback selection with runtime-owned sampling policy. */
export async function readSynchronizedPlaybackBatchFallback(
  session: EpisodeSession,
  request: SynchronizedPlaybackBatchReadRequest,
  options: SynchronizedPlaybackReadOptions = {},
  settlementOptions: {
    readonly onStreamSettlement?: SynchronizedPlaybackReadRequest["onStreamSettlement"];
    readonly onStreamSettlements?: SynchronizedPlaybackReadRequest["onStreamSettlements"];
    readonly settlementPriorityStreams?: readonly string[];
  } = {},
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
  const sourceNames = new Map(
    session.manifest.streams.map((stream) => [stream.id, stream.sourceName]),
  );
  const readStreams = prioritizedStreams(
    request.streams,
    settlementOptions.settlementPriorityStreams,
  );
  const batches = await readCompleteBoundedStreams({
    maxMessagesPerStream: GENERIC_PLAYBACK_FALLBACK_MAX_MESSAGES_PER_STREAM,
    operation: "generic-playback-fallback",
    priority: options.priority,
    session,
    signal: options.signal,
    onStreamComplete:
      (settlementOptions.onStreamSettlement ||
        settlementOptions.onStreamSettlements) &&
      // Per-stream settlements describe one tick. Batched multi-tick reads
      // have no single authoritative window to report.
      request.timeNs.length === 1
        ? (stream, streamBatches) => {
            const window = resolved[0];
            if (!window) return;
            const policy = window.streamPolicies[stream];
            const settlement = {
              stream,
              window: selectPlaybackWindow(
                collectFramesByStream(streamBatches, [stream]),
                [stream],
                sourceNames,
                {
                  endNs: policy.endNs,
                  startNs: readStartForPolicy(
                    session.manifest.timeRange.startNs,
                    streamsById,
                    stream,
                    policy,
                  ),
                  streamPolicies: { [stream]: policy },
                  timeNs: window.timeNs,
                },
              ),
            };
            settlementOptions.onStreamSettlements?.([settlement]);
            settlementOptions.onStreamSettlement?.(settlement);
          }
        : undefined,
    streams: readStreams,
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
  return resolved.map((window) =>
    selectPlaybackWindow(framesByStream, request.streams, sourceNames, window),
  );
}

async function readCompleteBoundedStreams({
  maxMessagesPerStream,
  operation,
  onStreamComplete,
  priority,
  session,
  signal,
  streams,
  windowForStream,
}: {
  readonly maxMessagesPerStream: number;
  readonly operation: string;
  readonly onStreamComplete?: (
    stream: string,
    batches: readonly FrameBatch[],
  ) => void;
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
    const streamBatches: FrameBatch[] = [];
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
      if (admitted.length > 0) {
        const admittedBatch = { frames: admitted, stream };
        batches.push(admittedBatch);
        streamBatches.push(admittedBatch);
      }
    }
    onStreamComplete?.(stream, streamBatches);
  }
  return batches;
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

function compareTransforms(
  left: TransformSample,
  right: TransformSample,
): number {
  const leftTimeNs = left.timestampNs ?? -1n;
  const rightTimeNs = right.timestampNs ?? -1n;
  return leftTimeNs < rightTimeNs ? -1 : leftTimeNs > rightTimeNs ? 1 : 0;
}

function compareFramesByTime(left: DecodedFrame, right: DecodedFrame): number {
  if (left.timestampNs !== right.timestampNs) {
    return left.timestampNs < right.timestampNs ? -1 : 1;
  }
  return (left.sequence ?? 0) - (right.sequence ?? 0);
}
