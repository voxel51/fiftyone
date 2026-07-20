import {
  useStreamValue,
  useStreamValueSelector,
  useStreamValues,
  useStreamValuesSelector,
} from "@fiftyone/playback";
import { useEffect, useMemo, useRef } from "react";
import {
  useEpisodeDataStream,
  type EpisodeDataStream,
} from "./episode-data-stream-context";

/** One committed stream value plus its content and placement timestamps. */
export interface EpisodeStreamPlaybackFrame<T = unknown> {
  readonly ageNs: bigint;
  readonly contentTimeNs: bigint;
  readonly frame: T;
  readonly requestedTimeNs: bigint;
}

/** Content identity without tick-relative placement metadata. */
export interface EpisodeStreamContentFrame<T = unknown> {
  readonly contentTimeNs: bigint;
  readonly frame: T;
}

/**
 * Tile-side hook: subscribes to one episode stream and returns its current frame.
 *
 * Calling this hook tells the data stream that the stream has an active
 * consumer. The data stream includes it in batch fetches and excludes it
 * when the tile is closed (subscriber count drops to zero).
 *
 * Uses `useStreamValue` rather than `useStream` because activation is
 * per-stream through the data stream — all streams ride one engine-level
 * stream that stays subscribed for the modal's lifetime.
 *
 * Returns `null` until the first frame is committed for this stream.
 */
export function useEpisodeStreamValue<T = unknown>(stream: string): T | null {
  const dataStream = useEpisodeDataStream();
  useEpisodeStreamSubscription(stream, dataStream);
  const frame = useStreamValueSelector<EpisodeStreamPlaybackFrame<T>, T | null>(
    stream,
    selectFrame,
  );
  return dataStream ? frame : null;
}

/**
 * Content-only playback frame for surfaces that need message identity but not
 * tick-relative age or placement time. Metadata-only stream commits do not
 * re-render the consumer.
 */
export function useEpisodeStreamContentFrame<T = unknown>(
  stream: string,
): EpisodeStreamContentFrame<T> | null {
  const dataStream = useEpisodeDataStream();
  useEpisodeStreamSubscription(stream, dataStream);
  const frame = useStreamValueSelector<
    EpisodeStreamPlaybackFrame<T>,
    EpisodeStreamContentFrame<T> | null
  >(stream, selectContentFrame, equalContentFrames);
  return dataStream ? frame : null;
}

/** Subscribes to one stream and returns its full placement-aware frame. */
export function useEpisodeStreamPlaybackFrame<T = unknown>(
  stream: string,
): EpisodeStreamPlaybackFrame<T> | null {
  const dataStream = useEpisodeDataStream();
  useEpisodeStreamSubscription(stream, dataStream);

  const value = useStreamValue<EpisodeStreamPlaybackFrame<T> | null>(stream);
  return dataStream ? value : null;
}

/**
 * Tile-side hook: subscribes to several episode streams at once and returns
 * their current frames, index-aligned with `streams`. Used by tiles that
 * compose multiple sources into one view (e.g. the 3D tile fusing every
 * selected point cloud).
 *
 * Subscriptions are diffed, not torn down wholesale: deselecting one
 * stream must not drop the others' subscriber counts, since a stream
 * cache flushes itself when its last subscriber leaves.
 *
 * Pass a referentially stable array — a new identity re-derives the
 * combined atom and re-diffs the subscriptions.
 */
export function useEpisodeStreamValues<T = unknown>(
  streams: readonly string[],
): readonly (T | null)[] {
  const dataStream = useEpisodeDataStream();
  const values = useStreamValuesSelector<
    EpisodeStreamPlaybackFrame<T>,
    T | null
  >(streams, selectFrame);
  useEpisodeStreamSubscriptions(streams, dataStream);
  // Only the fallback's length matters; stream identity is intentionally
  // excluded so unavailable-stream renders keep the same array instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const emptyValues = useMemo(() => streams.map(() => null), [streams.length]);
  return dataStream ? values : emptyValues;
}

/**
 * Subscribes to several streams and returns their placement-aware frames,
 * index-aligned with `streams`.
 */
export function useEpisodeStreamPlaybackFrames<T = unknown>(
  streams: readonly string[],
): readonly (EpisodeStreamPlaybackFrame<T> | null)[] {
  const dataStream = useEpisodeDataStream();
  const values = useStreamValues<EpisodeStreamPlaybackFrame<T> | null>(streams);
  // Only the fallback's length matters; stream identity is intentionally
  // excluded so unavailable-stream renders keep the same array instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const emptyValues = useMemo(() => streams.map(() => null), [streams.length]);
  useEpisodeStreamSubscriptions(streams, dataStream);

  return dataStream ? values : emptyValues;
}

function useEpisodeStreamSubscription(
  stream: string,
  dataStream: EpisodeDataStream | null,
): void {
  // This effect owns the active-consumer lease for one stream.
  useEffect(() => {
    if (!stream || !dataStream) return undefined;
    return dataStream.subscribeToStream(stream);
  }, [dataStream, stream]);
}

function useEpisodeStreamSubscriptions(
  streams: readonly string[],
  dataStream: EpisodeDataStream | null,
): void {
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const streamRef = useRef<EpisodeDataStream | null>(null);

  // This effect diffs stream leases and resets them when the stream changes.
  useEffect(() => {
    const subscriptions = subscriptionsRef.current;

    if (streamRef.current !== dataStream) {
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
      streamRef.current = dataStream;
    }
    if (!dataStream) return;

    const streamSet = new Set(streams);
    for (const [stream, unsubscribe] of subscriptions) {
      if (!streamSet.has(stream)) {
        unsubscribe();
        subscriptions.delete(stream);
      }
    }
    for (const stream of streams) {
      if (stream && !subscriptions.has(stream)) {
        subscriptions.set(stream, dataStream.subscribeToStream(stream));
      }
    }
  }, [dataStream, streams]);

  // This effect releases every remaining stream lease on unmount.
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

function selectFrame<T>(value: EpisodeStreamPlaybackFrame<T> | null): T | null {
  return value?.frame ?? null;
}

function selectContentFrame<T>(
  value: EpisodeStreamPlaybackFrame<T> | null,
): EpisodeStreamContentFrame<T> | null {
  return value
    ? { contentTimeNs: value.contentTimeNs, frame: value.frame }
    : null;
}

function equalContentFrames<T>(
  left: EpisodeStreamContentFrame<T> | null,
  right: EpisodeStreamContentFrame<T> | null,
): boolean {
  return (
    left === right ||
    (!!left &&
      !!right &&
      left.contentTimeNs === right.contentTimeNs &&
      left.frame === right.frame)
  );
}
