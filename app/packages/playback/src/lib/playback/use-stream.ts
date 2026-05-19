import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { usePlayback } from "./PlaybackProvider";
import { usePlaybackStore } from "./playback-store-context";
import { streamValueAtom } from "./atoms";

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
  const store = usePlaybackStore();

  // subscribeStream is a stable action; an empty id is a no-op subscription
  // (the engine never has a stream registered under "") — skip the work.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!id) return undefined;
    return subscribeStream(id);
  }, [id]);

  // Target the playback store explicitly — see `playback-store-context.ts`
  // for why we can't rely on Jotai's nearest-provider lookup.
  return useAtomValue(streamValueAtom(id), { store }) as T | null;
}
