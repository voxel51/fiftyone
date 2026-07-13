import { useEffect, useMemo, useRef, useState } from "react";

import type { ImageVisualization } from "../../../decoders";
import type { McapDecodedMessage } from "../types";
import {
  useMcapDataStream,
  type McapDataStream,
} from "./mcap-data-stream-context";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

const INITIAL_VIDEO_RUNWAY_LOOKBACK_NS = 15_000_000_000n;
const EMPTY_RUNWAY: readonly ImageVisualization[] = [];

interface VideoDecodeRunway {
  readonly frames: readonly ImageVisualization[];
  readonly targetTimeNs: bigint;
}

/**
 * Reconstructs the ordered H.264 access-unit runway needed when a tile joins
 * a stream on a delta frame. One runway is fetched per newly joined topic (and
 * again after a backwards seek); ordinary forward playback stays on the
 * already-configured shared decoder session.
 */
export function useMcapVideoDecodeRunways(
  topics: readonly string[],
  playbackFrames: readonly (McapTopicPlaybackFrame<ImageVisualization> | null)[],
): readonly (readonly ImageVisualization[])[] {
  const dataStream = useMcapDataStream();
  const [runways, setRunways] = useState<
    Readonly<Record<string, VideoDecodeRunway>>
  >({});
  const inFlightTopicsRef = useRef(new Map<string, symbol>());
  const initializedTopicsRef = useRef(new Set<string>());
  const awaitingFirstKeyframeTopicsRef = useRef(new Set<string>());
  const attemptedTargetsRef = useRef(new Map<string, bigint>());
  const lastSeenTimeRef = useRef(new Map<string, bigint>());
  const dataStreamRef = useRef(dataStream);

  // This effect resets per-recording decoder state, prunes removed topics,
  // and fetches a keyframe runway when playback first lands on a delta frame.
  useEffect(() => {
    if (dataStreamRef.current !== dataStream) {
      dataStreamRef.current = dataStream;
      inFlightTopicsRef.current.clear();
      initializedTopicsRef.current.clear();
      awaitingFirstKeyframeTopicsRef.current.clear();
      attemptedTargetsRef.current.clear();
      lastSeenTimeRef.current.clear();
      setRunways({});
    }
    const availableTopics = new Set(topics);
    for (const topic of initializedTopicsRef.current) {
      if (!availableTopics.has(topic))
        initializedTopicsRef.current.delete(topic);
    }
    for (const topic of awaitingFirstKeyframeTopicsRef.current) {
      if (!availableTopics.has(topic)) {
        awaitingFirstKeyframeTopicsRef.current.delete(topic);
      }
    }
    for (const topic of attemptedTargetsRef.current.keys()) {
      if (!availableTopics.has(topic))
        attemptedTargetsRef.current.delete(topic);
    }
    for (const topic of lastSeenTimeRef.current.keys()) {
      if (!availableTopics.has(topic)) lastSeenTimeRef.current.delete(topic);
    }
    setRunways((current) => {
      let changed = false;
      const next: Record<string, VideoDecodeRunway> = {};
      for (const [topic, runway] of Object.entries(current)) {
        const index = topics.indexOf(topic);
        if (
          index >= 0 &&
          playbackFrames[index]?.contentTimeNs === runway.targetTimeNs
        ) {
          next[topic] = runway;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });

    let cancelled = false;
    topics.forEach((topic, index) => {
      const playbackFrame = playbackFrames[index];
      const frame = playbackFrame?.frame;
      if (!topic || !playbackFrame || frame?.kind !== "encoded-video") return;
      if (frame.codec !== "h264") return;

      const targetTimeNs = playbackFrame.contentTimeNs;
      const previousTimeNs = lastSeenTimeRef.current.get(topic);
      lastSeenTimeRef.current.set(topic, targetTimeNs);
      if (previousTimeNs !== undefined && targetTimeNs < previousTimeNs) {
        initializedTopicsRef.current.delete(topic);
        awaitingFirstKeyframeTopicsRef.current.delete(topic);
        attemptedTargetsRef.current.delete(topic);
      }
      if (frame.keyframe) {
        initializedTopicsRef.current.add(topic);
        awaitingFirstKeyframeTopicsRef.current.delete(topic);
        return;
      }
      if (
        initializedTopicsRef.current.has(topic) ||
        awaitingFirstKeyframeTopicsRef.current.has(topic) ||
        inFlightTopicsRef.current.has(topic) ||
        attemptedTargetsRef.current.get(topic) === targetTimeNs
      ) {
        return;
      }

      attemptedTargetsRef.current.set(topic, targetTimeNs);
      const requestToken = Symbol(topic);
      inFlightTopicsRef.current.set(topic, requestToken);
      readH264DecodeRunway(dataStream, topic, targetTimeNs)
        .then((frames) => {
          if (cancelled) return;
          if (frames.length === 0) {
            awaitingFirstKeyframeTopicsRef.current.add(topic);
            return;
          }
          initializedTopicsRef.current.add(topic);
          setRunways((current) => ({
            ...current,
            [topic]: { frames, targetTimeNs },
          }));
        })
        .catch(() => undefined)
        .finally(() => {
          if (inFlightTopicsRef.current.get(topic) === requestToken) {
            inFlightTopicsRef.current.delete(topic);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [dataStream, playbackFrames, topics]);

  return useMemo(
    () =>
      topics.map((topic, index) => {
        const runway = runways[topic];
        return runway &&
          runway.targetTimeNs === playbackFrames[index]?.contentTimeNs
          ? runway.frames
          : EMPTY_RUNWAY;
      }),
    [playbackFrames, runways, topics],
  );
}

/** Single-topic convenience wrapper used by an image tile. */
export function useMcapVideoDecodeRunway(
  topic: string,
  playbackFrame: McapTopicPlaybackFrame<ImageVisualization> | null,
): readonly ImageVisualization[] {
  const topics = useMemo(() => (topic ? [topic] : []), [topic]);
  const playbackFrames = useMemo(
    () => (topic ? [playbackFrame] : []),
    [playbackFrame, topic],
  );
  return useMcapVideoDecodeRunways(topics, playbackFrames)[0] ?? EMPTY_RUNWAY;
}

async function readH264DecodeRunway(
  dataStream: McapDataStream | null,
  topic: string,
  targetTimeNs: bigint,
): Promise<readonly ImageVisualization[]> {
  const timeline = dataStream?.getTimelineIndex();
  const readTopicMessages = dataStream?.readTopicMessages;
  if (!timeline || !readTopicMessages || targetTimeNs <= timeline.startTimeNs) {
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
    const messages = await readTopicMessages({
      endTimeNs,
      startTimeNs,
      topic,
    });
    const runway = h264RunwayFromMessages(messages);
    if (runway.length > 0) return runway;
    lookbackNs *= 2n;
  } while (startTimeNs !== timeline.startTimeNs);

  return EMPTY_RUNWAY;
}

/** Returns the last keyframe and every following H.264 frame in the range. */
export function h264RunwayFromMessages(
  messages: readonly McapDecodedMessage[],
): readonly ImageVisualization[] {
  let runway: ImageVisualization[] = [];
  let foundKeyframe = false;
  for (const message of messages) {
    const frame = message.decoded.output.visualization;
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
