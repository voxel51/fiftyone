import type { PlaybackStore } from "@fiftyone/playback";
import { getIsPlaying } from "@fiftyone/playback/runtime";

import {
  getNetworkHealth,
  shouldDeferIdleWorkForStore,
} from "./network-health";

/** Cancellation and retry controls scoped to one bulk stream read. */
export interface BulkStreamControl {
  readonly isCancelled: () => boolean;
  readonly signal: AbortSignal;
  readonly standDown: () => boolean;
}

/**
 * Starts each stream once, delaying and retrying work while foreground playback
 * needs the network. The caller retains ownership of stream-specific reads and
 * accumulation.
 */
export function startBulkStreamLifecycle({
  initialDelayMs,
  retryDelayMs,
  runStream,
  shouldStandDown,
  streams,
}: {
  readonly initialDelayMs: number;
  readonly retryDelayMs: number;
  readonly runStream: (
    stream: string,
    control: BulkStreamControl,
  ) => Promise<void>;
  readonly shouldStandDown: () => boolean;
  readonly streams: readonly string[];
}): () => void {
  let cancelled = false;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  const fetchedStreams = new Set<string>();
  const activeControllers = new Set<AbortController>();

  const schedule = (delayMs: number) => {
    if (cancelled || retryTimeout !== null) return;
    retryTimeout = setTimeout(() => {
      retryTimeout = null;
      start();
    }, delayMs);
  };

  const start = () => {
    if (cancelled) return;
    if (shouldStandDown()) {
      schedule(retryDelayMs);
      return;
    }

    for (const stream of streams) {
      if (fetchedStreams.has(stream)) continue;
      fetchedStreams.add(stream);
      let retryAfterRun = false;
      const controller = new AbortController();
      activeControllers.add(controller);
      const run = runStream(stream, {
        isCancelled: () => cancelled,
        signal: controller.signal,
        standDown: () => {
          if (cancelled) return true;
          if (!shouldStandDown()) return false;
          retryAfterRun = true;
          return true;
        },
      });
      const finish = () => {
        activeControllers.delete(controller);
        if (!cancelled && retryAfterRun) {
          fetchedStreams.delete(stream);
          schedule(retryDelayMs);
        }
      };
      void run.then(finish, finish);
    }
  };

  if (initialDelayMs > 0) {
    schedule(initialDelayMs);
  } else {
    start();
  }

  return () => {
    cancelled = true;
    for (const controller of activeControllers) controller.abort();
    activeControllers.clear();
    if (retryTimeout !== null) clearTimeout(retryTimeout);
  };
}

/** Returns whether a full-history read should yield to foreground playback. */
export function shouldDeferBulkHistory(
  playbackStore: PlaybackStore | null,
): boolean {
  if (!playbackStore) return false;
  if (getIsPlaying(playbackStore) && getNetworkHealth(playbackStore).limited) {
    return true;
  }
  return shouldDeferIdleWorkForStore(playbackStore, null);
}
