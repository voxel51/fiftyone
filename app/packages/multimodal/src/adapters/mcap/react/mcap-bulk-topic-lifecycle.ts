import type { PlaybackStore } from "@fiftyone/playback";
import { getIsPlaying } from "@fiftyone/playback/src/lib/playback/store-access";

import {
  getMcapNetworkHealth,
  shouldDeferMcapIdleWorkForStore,
} from "./mcap-network-health";

/** Cancellation and retry controls scoped to one bulk topic read. */
export interface McapBulkTopicControl {
  readonly isCancelled: () => boolean;
  readonly standDown: () => boolean;
}

/**
 * Starts each topic once, delaying and retrying work while foreground playback
 * needs the network. The caller retains ownership of topic-specific reads and
 * accumulation.
 */
export function startMcapBulkTopicLifecycle({
  initialDelayMs,
  retryDelayMs,
  runTopic,
  shouldStandDown,
  topics,
}: {
  readonly initialDelayMs: number;
  readonly retryDelayMs: number;
  readonly runTopic: (
    topic: string,
    control: McapBulkTopicControl,
  ) => Promise<void>;
  readonly shouldStandDown: () => boolean;
  readonly topics: readonly string[];
}): () => void {
  let cancelled = false;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  const fetchedTopics = new Set<string>();

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

    for (const topic of topics) {
      if (fetchedTopics.has(topic)) continue;
      fetchedTopics.add(topic);
      let retryAfterRun = false;
      const run = runTopic(topic, {
        isCancelled: () => cancelled,
        standDown: () => {
          if (cancelled) return true;
          if (!shouldStandDown()) return false;
          retryAfterRun = true;
          return true;
        },
      });
      const finish = () => {
        if (!cancelled && retryAfterRun) {
          fetchedTopics.delete(topic);
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
    if (retryTimeout !== null) clearTimeout(retryTimeout);
  };
}

/** Returns whether a full-history read should yield to foreground playback. */
export function shouldDeferMcapBulkHistory(
  playbackStore: PlaybackStore | null,
): boolean {
  if (!playbackStore) return false;
  if (
    getIsPlaying(playbackStore) &&
    getMcapNetworkHealth(playbackStore).limited
  ) {
    return true;
  }
  return shouldDeferMcapIdleWorkForStore(playbackStore, null);
}
