import type { TimeWindow } from "../ir";

const ranges = new Map<string, TimeWindow>();
const listeners = new Map<string, Set<() => void>>();

/** Publishes the best known inclusive time range for one episode identity. */
export function publishEpisodeTimeRange(
  episodeId: string,
  range: TimeWindow,
): void {
  ranges.set(episodeId, range);
  for (const listener of listeners.get(episodeId) ?? []) listener();
}

/** Returns a stable external-store snapshot for one episode. */
export function getEpisodeTimeRange(episodeId: string): TimeWindow | null {
  return ranges.get(episodeId) ?? null;
}

/** Releases a published episode range when its source is no longer retained. */
export function releaseEpisodeTimeRange(episodeId: string): void {
  if (!ranges.delete(episodeId)) return;
  for (const listener of listeners.get(episodeId) ?? []) listener();
}

/** Subscribes to time-range changes for one episode. */
export function subscribeEpisodeTimeRange(
  episodeId: string,
  listener: () => void,
): () => void {
  const episodeListeners = listeners.get(episodeId) ?? new Set<() => void>();
  episodeListeners.add(listener);
  listeners.set(episodeId, episodeListeners);
  return () => {
    if (listeners.get(episodeId) !== episodeListeners) return;
    episodeListeners.delete(listener);
    if (episodeListeners.size === 0) listeners.delete(episodeId);
  };
}

/** Clears shared episode ranges between tests. */
export function resetEpisodeTimeRangesForTests(): void {
  ranges.clear();
  try {
    for (const episodeListeners of listeners.values()) {
      for (const listener of episodeListeners) listener();
    }
  } finally {
    listeners.clear();
  }
}
