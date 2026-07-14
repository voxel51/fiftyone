import { useStreamValue, useStreamValues } from "@fiftyone/playback";
import { useEffect, useRef } from "react";
import {
  useMcapDataStream,
  type McapDataStream,
} from "./mcap-data-stream-context";

export interface McapTopicPlaybackFrame<T = unknown> {
  readonly ageNs: bigint;
  readonly contentTimeNs: bigint;
  readonly frame: T;
  readonly requestedTimeNs: bigint;
}

/**
 * Tile-side hook: subscribes to one MCAP topic and returns its current frame.
 *
 * Calling this hook tells the data stream that the topic has an active
 * consumer. The data stream includes it in batch fetches and excludes it
 * when the tile is closed (subscriber count drops to zero).
 *
 * Uses `useStreamValue` rather than `useStream` because activation is
 * per-topic through the data stream — all topics ride one engine-level
 * stream that stays subscribed for the modal's lifetime.
 *
 * Returns `null` until the first frame is committed for this topic.
 */
export function useMcapTopicStream<T = unknown>(topic: string): T | null {
  return useMcapTopicPlaybackFrame<T>(topic)?.frame ?? null;
}

export function useMcapTopicPlaybackFrame<T = unknown>(
  topic: string,
): McapTopicPlaybackFrame<T> | null {
  const dataStream = useMcapDataStream();

  useEffect(() => {
    if (!topic || !dataStream) return undefined;
    return dataStream.subscribeToTopic(topic);
  }, [topic, dataStream]);

  return useStreamValue<McapTopicPlaybackFrame<T> | null>(topic);
}

/**
 * Tile-side hook: subscribes to several MCAP topics at once and returns
 * their current frames, index-aligned with `topics`. Used by tiles that
 * compose multiple sources into one view (e.g. the 3D tile fusing every
 * selected point cloud).
 *
 * Subscriptions are diffed, not torn down wholesale: deselecting one
 * topic must not drop the others' subscriber counts, since a topic
 * cache flushes itself when its last subscriber leaves.
 *
 * Pass a referentially stable array — a new identity re-derives the
 * combined atom and re-diffs the subscriptions.
 */
export function useMcapTopicStreams<T = unknown>(
  topics: readonly string[],
): readonly (T | null)[] {
  return useMcapTopicPlaybackFrames<T>(topics).map(
    (value) => value?.frame ?? null,
  );
}

export function useMcapTopicPlaybackFrames<T = unknown>(
  topics: readonly string[],
): readonly (McapTopicPlaybackFrame<T> | null)[] {
  const dataStream = useMcapDataStream();
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const streamRef = useRef<McapDataStream | null>(null);

  // This effect keeps the data stream's per-topic subscriptions in sync
  // with the requested set — subscribing additions, releasing removals,
  // and starting over when the data stream itself is replaced.
  useEffect(() => {
    const subscriptions = subscriptionsRef.current;

    if (streamRef.current !== dataStream) {
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
      streamRef.current = dataStream;
    }
    if (!dataStream) return;

    for (const [topic, unsubscribe] of subscriptions) {
      if (!topics.includes(topic)) {
        unsubscribe();
        subscriptions.delete(topic);
      }
    }
    for (const topic of topics) {
      if (topic && !subscriptions.has(topic)) {
        subscriptions.set(topic, dataStream.subscribeToTopic(topic));
      }
    }
  }, [topics, dataStream]);

  // This effect releases every remaining subscription when the consuming
  // tile unmounts.
  useEffect(
    () => () => {
      for (const unsubscribe of subscriptionsRef.current.values()) {
        unsubscribe();
      }
      subscriptionsRef.current.clear();
    },
    [],
  );

  return useStreamValues<McapTopicPlaybackFrame<T> | null>(topics);
}
