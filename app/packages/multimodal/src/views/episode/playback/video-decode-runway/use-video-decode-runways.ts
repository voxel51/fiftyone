import { useEffect, useMemo, useRef, useState } from "react";

import type { DecodedFrame, ImageVisualization } from "../../../../ir";
import { isEpisodeReadCancelledError } from "../../../../ports";
import {
  episodeLatencyNowMs,
  markEpisodeLatencyEvent,
} from "../../../../runtime/latency-observer";
import type {
  StreamFramePayloadMeasurementQuality,
  StreamFrameReadStopReason,
} from "../../../../runtime";
import { useDataStream, type DataStream } from "../data-stream-context";
import type { StreamContentFrame } from "../use-stream-values";
import { MAX_H264_DECODE_RUNWAY_FRAMES } from "../../../../codecs/h264-decode-policy";

const NS_PER_SECOND = 1_000_000_000n;
const EMPTY_RUNWAY: readonly ImageVisualization[] = [];

/** Request-local limits for reconstructing one H.264 dependency runway. */
export const VIDEO_DECODE_RUNWAY_POLICY = {
  initialLookbackNs: 15n * NS_PER_SECOND,
  maxDecodeFrames: MAX_H264_DECODE_RUNWAY_FRAMES,
  maxLookbackNs: 120n * NS_PER_SECOND,
  maxMessages: 4_096,
  maxObservedPayloadBytes: 128 * 1024 * 1024,
  maxWallTimeMs: 8_000,
} as const;

/** Terminal outcome of one bounded H.264 runway request. */
export type VideoDecodeRunwayStopReason =
  | "aborted"
  | "decode-ceiling"
  | "failed"
  | "found"
  | "lookback-ceiling"
  | "message-ceiling"
  | "observed-byte-ceiling"
  | "source-start"
  | "wall-time-ceiling";

/** Inclusive nanosecond range read while extending a runway backward. */
export interface VideoDecodeRunwayWindow {
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}

/** Runway frames plus cumulative work evidence for one request. */
export interface VideoDecodeRunwayOutcome {
  readonly deepestScanFloorNs: bigint | null;
  readonly elapsedMs: number;
  readonly frames: readonly ImageVisualization[];
  readonly measurementQuality: StreamFramePayloadMeasurementQuality;
  readonly observedPayloadByteOvershoot: number;
  readonly observedPayloadBytes: number;
  readonly scannedMessages: number;
  readonly stopReason: VideoDecodeRunwayStopReason;
  readonly unknownPayloadMessages: number;
  readonly windowsTried: readonly VideoDecodeRunwayWindow[];
}

interface VideoDecodeRunway {
  readonly frames: readonly ImageVisualization[];
  readonly targetTimeNs: bigint;
}

interface ExhaustedRunwayMemo {
  readonly completeCoverage: boolean;
  readonly endTimeNs: bigint;
  readonly outcome: VideoDecodeRunwayOutcome;
  readonly startTimeNs: bigint;
  readonly targetTimeNs: bigint;
}

interface ActiveRunwayRequest {
  readonly controller: AbortController;
  diagnosticEmitted: boolean;
  readonly progress: MutableRunwayProgress;
  readonly targetTimeNs: bigint;
  readonly token: symbol;
}

interface MutableRunwayProgress {
  deepestScanFloorNs: bigint | null;
  readonly startedAtMs: number;
  elapsedMs: number;
  measurementQuality: StreamFramePayloadMeasurementQuality;
  observedPayloadByteOvershoot: number;
  observedPayloadBytes: number;
  scannedMessages: number;
  stopReason: VideoDecodeRunwayStopReason;
  unknownPayloadMessages: number;
  readonly windowsTried: VideoDecodeRunwayWindow[];
}

/**
 * Reconstructs the ordered H.264 access-unit runway needed when a tile joins
 * a stream on a delta frame. Requests are owned per stream: target changes and
 * lifecycle changes abort only that stream's obsolete work.
 */
export function useVideoDecodeRunways(
  streams: readonly string[],
  playbackFrames: readonly (StreamContentFrame<ImageVisualization> | null)[],
): readonly (readonly ImageVisualization[])[] {
  const dataStream = useDataStream();
  const [runways, setRunways] = useState<
    Readonly<Record<string, VideoDecodeRunway>>
  >({});
  const inFlightStreamsRef = useRef(new Map<string, ActiveRunwayRequest>());
  const initializedStreamsRef = useRef(new Set<string>());
  const awaitingFirstKeyframeStreamsRef = useRef(new Set<string>());
  const attemptedTargetsRef = useRef(new Map<string, bigint>());
  const exhaustedIntervalsRef = useRef(new Map<string, ExhaustedRunwayMemo>());
  const currentTargetsRef = useRef(new Map<string, bigint>());
  const lastSeenTimeRef = useRef(new Map<string, bigint>());
  const dataStreamRef = useRef(dataStream);
  const latestDataStreamRef = useRef(dataStream);
  latestDataStreamRef.current = dataStream;
  currentTargetsRef.current = currentH264DeltaTargets(streams, playbackFrames);

  useEffect(
    () => () => {
      for (const [stream, request] of inFlightStreamsRef.current) {
        abortRunwayRequest(stream, request);
      }
      inFlightStreamsRef.current.clear();
    },
    [],
  );

  // This effect resets per-recording decoder state, prunes removed streams,
  // and fetches a keyframe runway when playback lands on a delta frame.
  useEffect(() => {
    if (dataStreamRef.current !== dataStream) {
      for (const [stream, request] of inFlightStreamsRef.current) {
        abortRunwayRequest(stream, request);
      }
      dataStreamRef.current = dataStream;
      inFlightStreamsRef.current.clear();
      initializedStreamsRef.current.clear();
      awaitingFirstKeyframeStreamsRef.current.clear();
      attemptedTargetsRef.current.clear();
      exhaustedIntervalsRef.current.clear();
      lastSeenTimeRef.current.clear();
      setRunways({});
    }

    const availableStreams = new Set(streams);
    for (const [stream, request] of inFlightStreamsRef.current) {
      if (!availableStreams.has(stream)) {
        abortRunwayRequest(stream, request);
        inFlightStreamsRef.current.delete(stream);
      }
    }
    for (const stream of initializedStreamsRef.current) {
      if (!availableStreams.has(stream)) {
        initializedStreamsRef.current.delete(stream);
      }
    }
    for (const stream of awaitingFirstKeyframeStreamsRef.current) {
      if (!availableStreams.has(stream)) {
        awaitingFirstKeyframeStreamsRef.current.delete(stream);
      }
    }
    for (const stream of attemptedTargetsRef.current.keys()) {
      if (!availableStreams.has(stream)) {
        attemptedTargetsRef.current.delete(stream);
      }
    }
    for (const stream of exhaustedIntervalsRef.current.keys()) {
      if (!availableStreams.has(stream)) {
        exhaustedIntervalsRef.current.delete(stream);
      }
    }
    for (const stream of lastSeenTimeRef.current.keys()) {
      if (!availableStreams.has(stream)) lastSeenTimeRef.current.delete(stream);
    }

    setRunways((current) => {
      let changed = false;
      const next: Record<string, VideoDecodeRunway> = {};
      for (const [stream, runway] of Object.entries(current)) {
        const index = streams.indexOf(stream);
        if (
          index >= 0 &&
          playbackFrames[index]?.contentTimeNs === runway.targetTimeNs
        ) {
          next[stream] = runway;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });

    streams.forEach((stream, index) => {
      const playbackFrame = playbackFrames[index];
      const frame = playbackFrame?.frame;
      const targetTimeNs = stream
        ? h264DeltaTargetTimeNs(playbackFrame)
        : undefined;
      const activeRequest = inFlightStreamsRef.current.get(stream);
      if (
        activeRequest &&
        (targetTimeNs === undefined ||
          activeRequest.targetTimeNs !== targetTimeNs)
      ) {
        abortRunwayRequest(stream, activeRequest);
        inFlightStreamsRef.current.delete(stream);
        if (
          attemptedTargetsRef.current.get(stream) === activeRequest.targetTimeNs
        ) {
          attemptedTargetsRef.current.delete(stream);
        }
      }

      if (!stream || !playbackFrame || frame?.kind !== "encoded-video") return;
      if (frame.codec !== "h264") return;

      const previousTimeNs = lastSeenTimeRef.current.get(stream);
      lastSeenTimeRef.current.set(stream, playbackFrame.contentTimeNs);
      if (
        previousTimeNs !== undefined &&
        playbackFrame.contentTimeNs < previousTimeNs
      ) {
        initializedStreamsRef.current.delete(stream);
        awaitingFirstKeyframeStreamsRef.current.delete(stream);
        attemptedTargetsRef.current.delete(stream);
      }
      if (frame.keyframe) {
        initializedStreamsRef.current.add(stream);
        awaitingFirstKeyframeStreamsRef.current.delete(stream);
        attemptedTargetsRef.current.delete(stream);
        exhaustedIntervalsRef.current.delete(stream);
        return;
      }
      if (
        targetTimeNs === undefined ||
        initializedStreamsRef.current.has(stream)
      ) {
        return;
      }

      const timelineStartNs = dataStream?.getTimelineIndex()?.startTimeNs;
      const memo = exhaustedIntervalsRef.current.get(stream);
      if (memo && timelineStartNs === undefined) return;
      if (
        memo &&
        timelineStartNs !== undefined &&
        exhaustedMemoCoversTarget(memo, targetTimeNs, timelineStartNs)
      ) {
        if (attemptedTargetsRef.current.get(stream) !== targetTimeNs) {
          attemptedTargetsRef.current.set(stream, targetTimeNs);
          awaitingFirstKeyframeStreamsRef.current.add(stream);
          emitVideoDecodeRunwayDiagnostic(stream, targetTimeNs, {
            ...memo.outcome,
            elapsedMs: 0,
            frames: EMPTY_RUNWAY,
            windowsTried: [],
          });
        }
        return;
      }
      const knownKeyframeLessInterval =
        memo &&
        timelineStartNs !== undefined &&
        exhaustedMemoCanExtendBackward(memo, targetTimeNs, timelineStartNs)
          ? { endTimeNs: memo.endTimeNs, startTimeNs: memo.startTimeNs }
          : undefined;
      if (memo && !knownKeyframeLessInterval) {
        // Negative coverage alone cannot stitch a dependency chain if an older
        // extension later finds a keyframe. Invalidate and rescan the full
        // bounded range instead of returning a chain with missing deltas.
        exhaustedIntervalsRef.current.delete(stream);
        awaitingFirstKeyframeStreamsRef.current.delete(stream);
        attemptedTargetsRef.current.delete(stream);
      }
      if (
        awaitingFirstKeyframeStreamsRef.current.has(stream) ||
        inFlightStreamsRef.current.has(stream) ||
        attemptedTargetsRef.current.get(stream) === targetTimeNs
      ) {
        return;
      }

      attemptedTargetsRef.current.set(stream, targetTimeNs);
      const requestDataStream = dataStream;
      const request: ActiveRunwayRequest = {
        controller: new AbortController(),
        diagnosticEmitted: false,
        progress: createRunwayProgress(),
        targetTimeNs,
        token: Symbol(stream),
      };
      inFlightStreamsRef.current.set(stream, request);
      readH264DecodeRunway(
        dataStream,
        stream,
        targetTimeNs,
        request.controller.signal,
        request.progress,
        knownKeyframeLessInterval,
      )
        .then((outcome) => {
          if (
            latestDataStreamRef.current !== requestDataStream ||
            inFlightStreamsRef.current.get(stream)?.token !== request.token ||
            currentTargetsRef.current.get(stream) !== targetTimeNs
          ) {
            return;
          }
          if (!request.diagnosticEmitted) {
            emitVideoDecodeRunwayDiagnostic(stream, targetTimeNs, outcome);
            request.diagnosticEmitted = true;
          }
          if (outcome.stopReason === "aborted") {
            attemptedTargetsRef.current.delete(stream);
            return;
          }
          if (outcome.stopReason === "failed") {
            attemptedTargetsRef.current.delete(stream);
            return;
          }
          if (outcome.stopReason !== "found") {
            awaitingFirstKeyframeStreamsRef.current.add(stream);
            if (
              knownKeyframeLessInterval &&
              outcome.stopReason !== "lookback-ceiling" &&
              outcome.stopReason !== "source-start"
            ) {
              return;
            }
            const memoizedOutcome = { ...outcome, frames: EMPTY_RUNWAY };
            exhaustedIntervalsRef.current.set(stream, {
              completeCoverage:
                outcome.stopReason === "lookback-ceiling" ||
                outcome.stopReason === "source-start",
              endTimeNs:
                knownKeyframeLessInterval?.endTimeNs ?? targetTimeNs - 1n,
              outcome: memoizedOutcome,
              startTimeNs:
                outcome.deepestScanFloorNs ?? timelineStartNs ?? targetTimeNs,
              targetTimeNs,
            });
            return;
          }
          exhaustedIntervalsRef.current.delete(stream);
          awaitingFirstKeyframeStreamsRef.current.delete(stream);
          initializedStreamsRef.current.add(stream);
          setRunways((current) => ({
            ...current,
            [stream]: { frames: outcome.frames, targetTimeNs },
          }));
        })
        .catch((error: unknown) => {
          if (
            latestDataStreamRef.current !== requestDataStream ||
            inFlightStreamsRef.current.get(stream)?.token !== request.token ||
            currentTargetsRef.current.get(stream) !== targetTimeNs ||
            request.controller.signal.aborted
          ) {
            return;
          }
          if (isEpisodeReadCancelledError(error)) {
            attemptedTargetsRef.current.delete(stream);
            return;
          }
          request.progress.stopReason = "failed";
          request.progress.elapsedMs = Math.max(
            0,
            episodeLatencyNowMs() - request.progress.startedAtMs,
          );
          if (!request.diagnosticEmitted) {
            emitVideoDecodeRunwayDiagnostic(
              stream,
              targetTimeNs,
              outcomeFromProgress(request.progress),
              error,
            );
            request.diagnosticEmitted = true;
          }
          console.error("Failed to read an H.264 decode runway", {
            error,
            stream,
            targetTimeNs,
          });
          attemptedTargetsRef.current.delete(stream);
        })
        .finally(() => {
          if (inFlightStreamsRef.current.get(stream)?.token === request.token) {
            inFlightStreamsRef.current.delete(stream);
          }
        });
    });
  }, [dataStream, playbackFrames, streams]);

  return useMemo(
    () =>
      streams.map((stream, index) => {
        const runway = runways[stream];
        return runway &&
          runway.targetTimeNs === playbackFrames[index]?.contentTimeNs
          ? runway.frames
          : EMPTY_RUNWAY;
      }),
    [playbackFrames, runways, streams],
  );
}

/** Single-stream convenience wrapper used by an image tile. */
export function useVideoDecodeRunway(
  stream: string,
  playbackFrame: StreamContentFrame<ImageVisualization> | null,
): readonly ImageVisualization[] {
  const streams = useMemo(() => (stream ? [stream] : []), [stream]);
  const playbackFrames = useMemo(
    () => (stream ? [playbackFrame] : []),
    [playbackFrame, stream],
  );
  return useVideoDecodeRunways(streams, playbackFrames)[0] ?? EMPTY_RUNWAY;
}

/**
 * Builds the four inclusive, disjoint extensions: 15s, 15s, 30s, then 60s.
 */
export function createH264DecodeRunwayWindows(
  timelineStartNs: bigint,
  targetTimeNs: bigint,
): readonly VideoDecodeRunwayWindow[] {
  if (targetTimeNs <= timelineStartNs) return [];
  const cumulativeLookbacks = [
    VIDEO_DECODE_RUNWAY_POLICY.initialLookbackNs,
    VIDEO_DECODE_RUNWAY_POLICY.initialLookbackNs * 2n,
    VIDEO_DECODE_RUNWAY_POLICY.initialLookbackNs * 4n,
    VIDEO_DECODE_RUNWAY_POLICY.maxLookbackNs,
  ];
  const windows: VideoDecodeRunwayWindow[] = [];
  let endTimeNs = targetTimeNs - 1n;
  for (const lookbackNs of cumulativeLookbacks) {
    if (endTimeNs < timelineStartNs) break;
    const unclampedStartNs = targetTimeNs - lookbackNs;
    const startTimeNs =
      unclampedStartNs > timelineStartNs ? unclampedStartNs : timelineStartNs;
    windows.push({ endTimeNs, startTimeNs });
    if (startTimeNs === timelineStartNs) break;
    endTimeNs = startTimeNs - 1n;
  }
  return windows;
}

/** Reads one complete, bounded dependency chain or returns a terminal reason. */
export async function readH264DecodeRunway(
  dataStream: DataStream | null,
  stream: string,
  targetTimeNs: bigint,
  signal: AbortSignal,
  progress = createRunwayProgress(),
  knownKeyframeLessInterval?: VideoDecodeRunwayWindow,
): Promise<VideoDecodeRunwayOutcome> {
  const timeline = dataStream?.getTimelineIndex();
  const readStreamFrames = dataStream?.readStreamFrames;
  if (!timeline || !readStreamFrames) {
    progress.stopReason = "failed";
    return finishRunwayProgress(progress);
  }
  const windows = createH264DecodeRunwayWindows(
    timeline.startTimeNs,
    targetTimeNs,
  );
  if (windows.length === 0) {
    progress.stopReason = "source-start";
    return finishRunwayProgress(progress);
  }

  const deadlineMs =
    progress.startedAtMs + VIDEO_DECODE_RUNWAY_POLICY.maxWallTimeMs;

  const fullCoverageFloorNs = windows.at(-1)?.startTimeNs;
  const targetEndTimeNs = targetTimeNs - 1n;
  if (
    knownKeyframeLessInterval &&
    fullCoverageFloorNs !== undefined &&
    fullCoverageFloorNs < knownKeyframeLessInterval.startTimeNs &&
    targetEndTimeNs >= knownKeyframeLessInterval.startTimeNs &&
    targetEndTimeNs <= knownKeyframeLessInterval.endTimeNs
  ) {
    const extension = await readRunwayWindow(
      readStreamFrames,
      stream,
      {
        endTimeNs: knownKeyframeLessInterval.startTimeNs - 1n,
        startTimeNs: fullCoverageFloorNs,
      },
      signal,
      progress,
      deadlineMs,
    );
    if (!extension) return finishRunwayProgress(progress);
    const extensionRunway = h264RunwayFromMessages(extension);
    if (extensionRunway.length === 0) {
      progress.stopReason =
        fullCoverageFloorNs === timeline.startTimeNs
          ? "source-start"
          : "lookback-ceiling";
      return finishRunwayProgress(progress);
    }
    if (extensionRunway.length > VIDEO_DECODE_RUNWAY_POLICY.maxDecodeFrames) {
      progress.stopReason = "decode-ceiling";
      return finishRunwayProgress(progress);
    }

    // The memo retained negative keyframe evidence, not payloads. Once the new
    // extension finds a keyframe, read only the known newer interval to stitch
    // its delta dependency chain; the two reads remain disjoint and cumulative.
    const dependencyTail = await readRunwayWindow(
      readStreamFrames,
      stream,
      {
        endTimeNs: targetEndTimeNs,
        startTimeNs: knownKeyframeLessInterval.startTimeNs,
      },
      signal,
      progress,
      deadlineMs,
    );
    if (!dependencyTail) return finishRunwayProgress(progress);
    return finishCompleteRunway(progress, [...extension, ...dependencyTail]);
  }

  let messages: DecodedFrame[] = [];
  for (const window of windows) {
    const segment = await readRunwayWindow(
      readStreamFrames,
      stream,
      window,
      signal,
      progress,
      deadlineMs,
    );
    if (!segment) return finishRunwayProgress(progress);
    messages = [...segment, ...messages];

    const runway = h264RunwayFromMessages(messages);
    if (runway.length > VIDEO_DECODE_RUNWAY_POLICY.maxDecodeFrames) {
      progress.stopReason = "decode-ceiling";
      return finishRunwayProgress(progress);
    }
    if (runway.length > 0) {
      progress.stopReason = "found";
      return finishRunwayProgress(progress, runway);
    }
  }

  progress.stopReason =
    windows.at(-1)?.startTimeNs === timeline.startTimeNs
      ? "source-start"
      : "lookback-ceiling";
  return finishRunwayProgress(progress);
}

async function readRunwayWindow(
  readStreamFrames: NonNullable<DataStream["readStreamFrames"]>,
  stream: string,
  window: VideoDecodeRunwayWindow,
  signal: AbortSignal,
  progress: MutableRunwayProgress,
  deadlineMs: number,
): Promise<readonly DecodedFrame[] | null> {
  if (signal.aborted) {
    progress.stopReason = "aborted";
    return null;
  }
  progress.windowsTried.push(window);
  progress.deepestScanFloorNs =
    progress.deepestScanFloorNs === null ||
    window.startTimeNs < progress.deepestScanFloorNs
      ? window.startTimeNs
      : progress.deepestScanFloorNs;
  const remainingMessages =
    VIDEO_DECODE_RUNWAY_POLICY.maxMessages - progress.scannedMessages;
  if (remainingMessages <= 0) {
    progress.stopReason = "message-ceiling";
    return null;
  }
  const result = await readStreamFrames({
    budget: {
      deadlineMs,
      maxMessages: remainingMessages,
      maxObservedPayloadBytes:
        VIDEO_DECODE_RUNWAY_POLICY.maxObservedPayloadBytes -
        progress.observedPayloadBytes,
    },
    endTimeNs: window.endTimeNs,
    signal,
    startTimeNs: window.startTimeNs,
    stream,
  });
  progress.scannedMessages += result.evidence.scannedMessages;
  progress.observedPayloadBytes += result.evidence.observedPayloadBytes;
  progress.observedPayloadByteOvershoot +=
    result.evidence.observedPayloadByteOvershoot;
  progress.unknownPayloadMessages += result.evidence.unknownPayloadMessages;
  if (result.evidence.scannedMessages > 0) {
    progress.measurementQuality = mergeMeasurementQuality(
      progress.measurementQuality,
      result.evidence.measurementQuality,
      progress.scannedMessages - result.evidence.scannedMessages,
    );
  }
  if (result.stopReason !== "complete") {
    progress.stopReason = runwayStopReason(result.stopReason);
    return null;
  }
  return result.frames;
}

function finishCompleteRunway(
  progress: MutableRunwayProgress,
  messages: readonly DecodedFrame[],
): VideoDecodeRunwayOutcome {
  const runway = h264RunwayFromMessages(messages);
  if (runway.length > VIDEO_DECODE_RUNWAY_POLICY.maxDecodeFrames) {
    progress.stopReason = "decode-ceiling";
    return finishRunwayProgress(progress);
  }
  if (runway.length === 0) {
    progress.stopReason = "lookback-ceiling";
    return finishRunwayProgress(progress);
  }
  progress.stopReason = "found";
  return finishRunwayProgress(progress, runway);
}

/** Returns the last keyframe and every following H.264 frame in the range. */
export function h264RunwayFromMessages(
  messages: readonly DecodedFrame[],
): readonly ImageVisualization[] {
  let runway: ImageVisualization[] = [];
  let foundKeyframe = false;
  for (const message of messages) {
    const frame = message.output.visualization;
    if (frame?.kind !== "encoded-video" || frame.codec !== "h264") continue;
    if (frame.keyframe) {
      foundKeyframe = true;
      runway = [frame];
    } else if (foundKeyframe) {
      runway.push(frame);
    }
  }
  return runway;
}

function currentH264DeltaTargets(
  streams: readonly string[],
  playbackFrames: readonly (StreamContentFrame<ImageVisualization> | null)[],
): Map<string, bigint> {
  const targets = new Map<string, bigint>();
  streams.forEach((stream, index) => {
    const playbackFrame = playbackFrames[index];
    const targetTimeNs = h264DeltaTargetTimeNs(playbackFrame);
    if (stream && targetTimeNs !== undefined) targets.set(stream, targetTimeNs);
  });
  return targets;
}

function h264DeltaTargetTimeNs(
  playbackFrame: StreamContentFrame<ImageVisualization> | null | undefined,
): bigint | undefined {
  const frame = playbackFrame?.frame;
  return playbackFrame &&
    frame?.kind === "encoded-video" &&
    frame.codec === "h264" &&
    !frame.keyframe
    ? playbackFrame.contentTimeNs
    : undefined;
}

function createRunwayProgress(): MutableRunwayProgress {
  return {
    deepestScanFloorNs: null,
    elapsedMs: 0,
    measurementQuality: "unknown",
    observedPayloadByteOvershoot: 0,
    observedPayloadBytes: 0,
    scannedMessages: 0,
    startedAtMs: episodeLatencyNowMs(),
    stopReason: "failed",
    unknownPayloadMessages: 0,
    windowsTried: [],
  };
}

function finishRunwayProgress(
  progress: MutableRunwayProgress,
  frames: readonly ImageVisualization[] = EMPTY_RUNWAY,
): VideoDecodeRunwayOutcome {
  progress.elapsedMs = Math.max(
    0,
    episodeLatencyNowMs() - progress.startedAtMs,
  );
  return outcomeFromProgress(progress, frames);
}

function outcomeFromProgress(
  progress: MutableRunwayProgress,
  frames: readonly ImageVisualization[] = EMPTY_RUNWAY,
): VideoDecodeRunwayOutcome {
  return {
    deepestScanFloorNs: progress.deepestScanFloorNs,
    elapsedMs: progress.elapsedMs,
    frames,
    measurementQuality: progress.measurementQuality,
    observedPayloadByteOvershoot: progress.observedPayloadByteOvershoot,
    observedPayloadBytes: progress.observedPayloadBytes,
    scannedMessages: progress.scannedMessages,
    stopReason: progress.stopReason,
    unknownPayloadMessages: progress.unknownPayloadMessages,
    windowsTried: [...progress.windowsTried],
  };
}

function runwayStopReason(
  reason: Exclude<StreamFrameReadStopReason, "complete">,
): VideoDecodeRunwayStopReason {
  return reason;
}

function mergeMeasurementQuality(
  current: StreamFramePayloadMeasurementQuality,
  next: StreamFramePayloadMeasurementQuality,
  previousMessageCount: number,
): StreamFramePayloadMeasurementQuality {
  if (previousMessageCount === 0) return next;
  if (current === next) return current;
  return "mixed";
}

function exhaustedMemoCoversTarget(
  memo: ExhaustedRunwayMemo,
  targetTimeNs: bigint,
  timelineStartNs: bigint,
): boolean {
  if (memo.targetTimeNs === targetTimeNs) return true;
  if (!memo.completeCoverage || targetTimeNs <= timelineStartNs) return false;
  const requiredStartNs =
    targetTimeNs - VIDEO_DECODE_RUNWAY_POLICY.maxLookbackNs > timelineStartNs
      ? targetTimeNs - VIDEO_DECODE_RUNWAY_POLICY.maxLookbackNs
      : timelineStartNs;
  return (
    requiredStartNs >= memo.startTimeNs && targetTimeNs - 1n <= memo.endTimeNs
  );
}

function exhaustedMemoCanExtendBackward(
  memo: ExhaustedRunwayMemo,
  targetTimeNs: bigint,
  timelineStartNs: bigint,
): boolean {
  if (!memo.completeCoverage || targetTimeNs <= timelineStartNs) return false;
  const targetEndTimeNs = targetTimeNs - 1n;
  const requiredStartNs =
    targetTimeNs - VIDEO_DECODE_RUNWAY_POLICY.maxLookbackNs > timelineStartNs
      ? targetTimeNs - VIDEO_DECODE_RUNWAY_POLICY.maxLookbackNs
      : timelineStartNs;
  return (
    requiredStartNs < memo.startTimeNs &&
    targetEndTimeNs >= memo.startTimeNs &&
    targetEndTimeNs <= memo.endTimeNs
  );
}

function abortRunwayRequest(
  stream: string,
  request: ActiveRunwayRequest,
): void {
  if (request.controller.signal.aborted) return;
  request.controller.abort();
  request.progress.stopReason = "aborted";
  request.progress.elapsedMs = Math.max(
    0,
    episodeLatencyNowMs() - request.progress.startedAtMs,
  );
  if (!request.diagnosticEmitted) {
    emitVideoDecodeRunwayDiagnostic(
      stream,
      request.targetTimeNs,
      outcomeFromProgress(request.progress),
    );
    request.diagnosticEmitted = true;
  }
}

function emitVideoDecodeRunwayDiagnostic(
  stream: string,
  targetTimeNs: bigint,
  outcome: VideoDecodeRunwayOutcome,
  error?: unknown,
): void {
  markEpisodeLatencyEvent("episode.video-decode-runway", {
    deepestLookbackNs:
      outcome.deepestScanFloorNs === null
        ? "0"
        : (targetTimeNs - outcome.deepestScanFloorNs).toString(),
    deepestScanFloorNs: outcome.deepestScanFloorNs?.toString() ?? null,
    elapsedMs: outcome.elapsedMs,
    ...(error instanceof Error ? { error: error.message.slice(0, 512) } : {}),
    measurementQuality: outcome.measurementQuality,
    observedPayloadByteOvershoot: outcome.observedPayloadByteOvershoot,
    observedPayloadBytes: outcome.observedPayloadBytes,
    scannedMessages: outcome.scannedMessages,
    stopReason: outcome.stopReason,
    stream,
    targetNs: targetTimeNs.toString(),
    unknownPayloadMessages: outcome.unknownPayloadMessages,
    windowsTried: outcome.windowsTried.map((window) => ({
      endNs: window.endTimeNs.toString(),
      startNs: window.startTimeNs.toString(),
    })),
  });
}
