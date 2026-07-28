import {
  useStreamValue,
  useStreamValueSelector,
  useStreamValues,
  useStreamValuesSelector,
} from "@fiftyone/playback";
import { useEffect, useMemo, useRef } from "react";
import {
  useMcapDataStream,
  type McapDataStream,
} from "./mcap-data-stream-context";

/** One committed topic value plus its content and placement timestamps. */
export interface McapTopicPlaybackFrame<T = unknown> {
  readonly ageNs: bigint;
  readonly contentTimeNs: bigint;
  readonly frame: T;
  readonly requestedTimeNs: bigint;
}

/** Content identity without tick-relative placement metadata. */
export interface McapTopicContentFrame<T = unknown> {
  readonly contentTimeNs: bigint;
  readonly frame: T;
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
  const dataStream = useMcapDataStream();
  useMcapTopicSubscription(topic, dataStream);
  const frame = useStreamValueSelector<McapTopicPlaybackFrame<T>, T | null>(
    topic,
    selectFrame,
  );
  return dataStream ? frame : null;
}

/**
 * Content-only playback frame for surfaces that need message identity but not
 * tick-relative age or placement time. Metadata-only stream commits do not
 * re-render the consumer.
 */
export function useMcapTopicContentFrame<T = unknown>(
  topic: string,
): McapTopicContentFrame<T> | null {
  const dataStream = useMcapDataStream();
  useMcapTopicSubscription(topic, dataStream);
  const frame = useStreamValueSelector<
    McapTopicPlaybackFrame<T>,
    McapTopicContentFrame<T> | null
  >(topic, selectContentFrame, equalContentFrames);
  return dataStream ? frame : null;
}

/** Subscribes to one topic and returns its full placement-aware frame. */
export function useMcapTopicPlaybackFrame<T = unknown>(
  topic: string,
): McapTopicPlaybackFrame<T> | null {
  const dataStream = useMcapDataStream();
  useMcapTopicSubscription(topic, dataStream);

  const value = useStreamValue<McapTopicPlaybackFrame<T> | null>(topic);
  return dataStream ? value : null;
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
  const dataStream = useMcapDataStream();
  const values = useStreamValuesSelector<McapTopicPlaybackFrame<T>, T | null>(
    topics,
    selectFrame,
  );
  useMcapTopicSubscriptions(topics, dataStream);
  // Only the fallback's length matters; topic identity is intentionally
  // excluded so unavailable-stream renders keep the same array instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const emptyValues = useMemo(() => topics.map(() => null), [topics.length]);
  return dataStream ? values : emptyValues;
}

/**
 * Subscribes to several topics and returns their placement-aware frames,
 * index-aligned with `topics`.
 */
export function useMcapTopicPlaybackFrames<T = unknown>(
  topics: readonly string[],
): readonly (McapTopicPlaybackFrame<T> | null)[] {
  const dataStream = useMcapDataStream();
  const values = useStreamValues<McapTopicPlaybackFrame<T> | null>(topics);
  // Only the fallback's length matters; topic identity is intentionally
  // excluded so unavailable-stream renders keep the same array instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const emptyValues = useMemo(() => topics.map(() => null), [topics.length]);
  useMcapTopicSubscriptions(topics, dataStream);

  return dataStream ? values : emptyValues;
}

function useMcapTopicSubscription(
  topic: string,
  dataStream: McapDataStream | null,
): void {
  // This effect owns the active-consumer lease for one topic.
  useEffect(() => {
    if (!topic || !dataStream) return undefined;
    return dataStream.subscribeToTopic(topic);
  }, [dataStream, topic]);
}

function useMcapTopicSubscriptions(
  topics: readonly string[],
  dataStream: McapDataStream | null,
): void {
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const streamRef = useRef<McapDataStream | null>(null);

  // This effect diffs topic leases and resets them when the stream changes.
  useEffect(() => {
    const subscriptions = subscriptionsRef.current;

    if (streamRef.current !== dataStream) {
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
      streamRef.current = dataStream;
    }
    if (!dataStream) return;

    const topicSet = new Set(topics);
    for (const [topic, unsubscribe] of subscriptions) {
      if (!topicSet.has(topic)) {
        unsubscribe();
        subscriptions.delete(topic);
      }
    }
    for (const topic of topics) {
      if (topic && !subscriptions.has(topic)) {
        subscriptions.set(topic, dataStream.subscribeToTopic(topic));
      }
    }
  }, [dataStream, topics]);

  // This effect releases every remaining topic lease on unmount.
  useEffect(
    () => () => {
      for (const unsubscribe of subscriptionsRef.current.values()) {
        unsubscribe();
      }
      subscriptionsRef.current.clear();
    },
    [],
  );
}

function selectFrame<T>(value: McapTopicPlaybackFrame<T> | null): T | null {
  return value?.frame ?? null;
}

function selectContentFrame<T>(
  value: McapTopicPlaybackFrame<T> | null,
): McapTopicContentFrame<T> | null {
  return value
    ? { contentTimeNs: value.contentTimeNs, frame: value.frame }
    : null;
}

function equalContentFrames<T>(
  left: McapTopicContentFrame<T> | null,
  right: McapTopicContentFrame<T> | null,
): boolean {
  return (
    left === right ||
    (!!left &&
      !!right &&
      left.contentTimeNs === right.contentTimeNs &&
      left.frame === right.frame)
  );
}
