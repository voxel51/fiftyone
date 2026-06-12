import { atom, useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { usePlayback } from "./PlaybackProvider";
import { usePlaybackStore } from "./playback-store-context";
import { streamValueAtom } from "./atoms";

/**
 * Reactive read of a stream's current committed value, WITHOUT marking the
 * stream active. For consumers whose activation is managed elsewhere —
 * e.g. MCAP tiles subscribe per-topic through the data stream, which owns
 * a single engine-level stream for all topics. Most consumers want
 * `useStream(id)`, which also activates the stream.
 *
 * Returns `null` until the stream produces its first committed value.
 */
export function useStreamValue<T = unknown>(id: string): T | null {
  const store = usePlaybackStore();
  // Target the playback store explicitly — see `playback-store-context.ts`
  // for why we can't rely on Jotai's nearest-provider lookup.
  return useAtomValue(streamValueAtom(id), { store }) as T | null;
}

/**
 * Reactive read of several streams' committed values, index-aligned with
 * `ids` — one derived-atom subscription instead of N hook calls, since
 * hooks can't be called in a loop over a dynamic id list. Same activation
 * caveat as `useStreamValue`. Pass a referentially stable array — a new
 * identity re-derives the combined atom.
 */
export function useStreamValues<T = unknown>(
  ids: readonly string[]
): readonly (T | null)[] {
  const store = usePlaybackStore();
  const valuesAtom = useMemo(
    () => atom((get) => ids.map((id) => get(streamValueAtom(id)))),
    [ids]
  );
  return useAtomValue(valuesAtom, { store }) as readonly (T | null)[];
}

/**
 * Subscribe to a stream's current data and re-render when it changes.
 *
 * Returns `null` until the stream is registered and produces its first
 * committed value. The subscription is reference-counted: while at least
 * one consumer holds a subscription the stream is active and the engine
 * drives it. When all consumers unmount the stream goes dormant and the
 * engine stops asking it for data.
 *
 * Provide a type parameter to narrow the return value:
 *
 * ```tsx
 * const frame = useStream<VideoFrame>("camera_front");
 * if (frame) renderImage(frame.src);
 * ```
 */
export function useStream<T = unknown>(id: string): T | null {
  const { subscribeStream } = usePlayback();

  // subscribeStream is a stable action; an empty id is a no-op subscription
  // (the engine never has a stream registered under "") — skip the work.
  useEffect(() => {
    if (!id) return undefined;
    return subscribeStream(id);
  }, [id, subscribeStream]);

  return useStreamValue<T>(id);
}
