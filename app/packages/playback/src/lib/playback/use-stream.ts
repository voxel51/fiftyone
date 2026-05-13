import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { usePlayback } from "./PlaybackProvider";
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

  useEffect(() => subscribeStream(id), [id, subscribeStream]);

  return useAtomValue(streamValueAtom(id)) as T | null;
}
