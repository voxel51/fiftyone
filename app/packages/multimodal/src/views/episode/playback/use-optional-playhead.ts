import {
  getPlayhead,
  subscribePlayhead,
  usePlaybackStore,
} from "@fiftyone/playback";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Reads the latest playhead during render, but only subscribes to RAF-rate
 * changes when `subscribed` is true. Content-driven parents can therefore
 * sample placement time without making the whole subtree a 60 Hz subscriber.
 */
export function useOptionalPlayhead(subscribed: boolean): number {
  const store = usePlaybackStore();
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      subscribed ? subscribePlayhead(store, onStoreChange) : () => undefined,
    [store, subscribed],
  );
  const getSnapshot = useCallback(() => getPlayhead(store), [store]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
