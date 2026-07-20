import { useEffect, useMemo, useRef, useState } from "react";

import type { ImageVisualization } from "../../decoders";
import type { DecodedFrame } from "../../ir";
import {
  useEpisodeDataStream,
  type EpisodeDataStream,
} from "./episode-data-stream-context";
import type { EpisodeStreamContentFrame } from "./use-episode-stream-values";

const INITIAL_VIDEO_RUNWAY_LOOKBACK_NS = 15_000_000_000n;
const EMPTY_RUNWAY: readonly ImageVisualization[] = [];

interface VideoDecodeRunway {
  readonly frames: readonly ImageVisualization[];
  readonly targetTimeNs: bigint;
}

/**
 * Reconstructs the ordered H.264 access-unit runway needed when a tile joins
 * a stream on a delta frame. One runway is fetched per newly joined stream (and
 * again after a backwards seek); ordinary forward playback stays on the
 * already-configured shared decoder session.
 */
export function useEpisodeVideoDecodeRunways(
  streams: readonly string[],
  playbackFrames: readonly (EpisodeStreamContentFrame<ImageVisualization> | null)[],
): readonly (readonly ImageVisualization[])[] {
  const dataStream = useEpisodeDataStream();
  const [runways, setRunways] = useState<
    Readonly<Record<string, VideoDecodeRunway>>
  >({});
  const inFlightStreamsRef = useRef(new Map<string, symbol>());
  const initializedStreamsRef = useRef(new Set<string>());
  const awaitingFirstKeyframeStreamsRef = useRef(new Set<string>());
  const attemptedTargetsRef = useRef(new Map<string, bigint>());
  const lastSeenTimeRef = useRef(new Map<string, bigint>());
  const dataStreamRef = useRef(dataStream);

  // This effect resets per-recording decoder state, prunes removed streams,
  // and fetches a keyframe runway when playback first lands on a delta frame.
  useEffect(() => {
    if (dataStreamRef.current !== dataStream) {
      dataStreamRef.current = dataStream;
      inFlightStreamsRef.current.clear();
      initializedStreamsRef.current.clear();
      awaitingFirstKeyframeStreamsRef.current.clear();
      attemptedTargetsRef.current.clear();
      lastSeenTimeRef.current.clear();
      setRunways({});
    }
    const availableStreams = new Set(streams);
    for (const stream of initializedStreamsRef.current) {
      if (!availableStreams.has(stream))
        initializedStreamsRef.current.delete(stream);
    }
    for (const stream of awaitingFirstKeyframeStreamsRef.current) {
      if (!availableStreams.has(stream)) {
        awaitingFirstKeyframeStreamsRef.current.delete(stream);
      }
    }
    for (const stream of attemptedTargetsRef.current.keys()) {
      if (!availableStreams.has(stream))
        attemptedTargetsRef.current.delete(stream);
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

    let cancelled = false;
    streams.forEach((stream, index) => {
      const playbackFrame = playbackFrames[index];
      const frame = playbackFrame?.frame;
      if (!stream || !playbackFrame || frame?.kind !== "encoded-video") return;
      if (frame.codec !== "h264") return;

      const targetTimeNs = playbackFrame.contentTimeNs;
      const previousTimeNs = lastSeenTimeRef.current.get(stream);
      lastSeenTimeRef.current.set(stream, targetTimeNs);
      if (previousTimeNs !== undefined && targetTimeNs < previousTimeNs) {
        initializedStreamsRef.current.delete(stream);
        awaitingFirstKeyframeStreamsRef.current.delete(stream);
        attemptedTargetsRef.current.delete(stream);
      }
      if (frame.keyframe) {
        initializedStreamsRef.current.add(stream);
        awaitingFirstKeyframeStreamsRef.current.delete(stream);
        return;
      }
      if (
        initializedStreamsRef.current.has(stream) ||
        awaitingFirstKeyframeStreamsRef.current.has(stream) ||
        inFlightStreamsRef.current.has(stream) ||
        attemptedTargetsRef.current.get(stream) === targetTimeNs
      ) {
        return;
      }

      attemptedTargetsRef.current.set(stream, targetTimeNs);
      const requestToken = Symbol(stream);
      inFlightStreamsRef.current.set(stream, requestToken);
      readH264DecodeRunway(dataStream, stream, targetTimeNs)
        .then((frames) => {
          if (cancelled) return;
          if (frames.length === 0) {
            awaitingFirstKeyframeStreamsRef.current.add(stream);
            return;
          }
          initializedStreamsRef.current.add(stream);
          setRunways((current) => ({
            ...current,
            [stream]: { frames, targetTimeNs },
          }));
        })
        .catch(() => undefined)
        .finally(() => {
          if (inFlightStreamsRef.current.get(stream) === requestToken) {
            inFlightStreamsRef.current.delete(stream);
          }
        });
    });

    return () => {
      cancelled = true;
    };
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
export function useEpisodeVideoDecodeRunway(
  stream: string,
  playbackFrame: EpisodeStreamContentFrame<ImageVisualization> | null,
): readonly ImageVisualization[] {
  const streams = useMemo(() => (stream ? [stream] : []), [stream]);
  const playbackFrames = useMemo(
    () => (stream ? [playbackFrame] : []),
    [playbackFrame, stream],
  );
  return (
    useEpisodeVideoDecodeRunways(streams, playbackFrames)[0] ?? EMPTY_RUNWAY
  );
}

async function readH264DecodeRunway(
  dataStream: EpisodeDataStream | null,
  stream: string,
  targetTimeNs: bigint,
): Promise<readonly ImageVisualization[]> {
  const timeline = dataStream?.getTimelineIndex();
  const readStreamFrames = dataStream?.readStreamFrames;
  if (!timeline || !readStreamFrames || targetTimeNs <= timeline.startTimeNs) {
    return EMPTY_RUNWAY;
  }

  const endTimeNs = targetTimeNs - 1n;
  let lookbackNs = INITIAL_VIDEO_RUNWAY_LOOKBACK_NS;
  let startTimeNs: bigint;
  do {
    startTimeNs =
      endTimeNs - lookbackNs > timeline.startTimeNs
        ? endTimeNs - lookbackNs
        : timeline.startTimeNs;
    const messages = await readStreamFrames({
      endTimeNs,
      startTimeNs,
      stream,
    });
    const runway = h264RunwayFromMessages(messages);
    if (runway.length > 0) return runway;
    lookbackNs *= 2n;
  } while (startTimeNs !== timeline.startTimeNs);

  return EMPTY_RUNWAY;
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
