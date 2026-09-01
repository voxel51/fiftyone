const playheads = new Map<string, bigint>();
const listeners = new Map<string, Set<() => void>>();

/**
 * Publishes the instant a grid tile is currently presenting, in absolute
 * nanoseconds, for one episode identity.
 *
 * The tile's own renderer is the only thing that knows this — it owns the
 * frame — but the interval lane that draws it is a sibling in the grid's
 * footer, outside that tree. This registry is the seam between them, the same
 * shape and for the same reason as the episode time range next to it.
 *
 * Absolute rather than episode-relative because that is what a decoded frame
 * carries; readers rebase against the episode's own range.
 */
export function publishEpisodePlayhead(
  episodeId: string,
  timestampNs: bigint,
): void {
  const current = playheads.get(episodeId);
  if (current === timestampNs) return;
  playheads.set(episodeId, timestampNs);
  for (const listener of listeners.get(episodeId) ?? []) listener();
}

/** Returns a stable external-store snapshot for one episode. */
export function getEpisodePlayhead(episodeId: string): bigint | null {
  return playheads.get(episodeId) ?? null;
}

/**
 * Withdraws a tile's playhead when it stops presenting frames.
 *
 * Called when hover playback ends or the cell unmounts: a stale playhead would
 * leave the lane marking a position nothing is showing any more.
 */
export function releaseEpisodePlayhead(episodeId: string): void {
  if (!playheads.delete(episodeId)) return;
  for (const listener of listeners.get(episodeId) ?? []) listener();
}

/** Subscribes to playhead changes for one episode. */
export function subscribeEpisodePlayhead(
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

/** Clears shared episode playheads between tests. */
export function resetEpisodePlayheadsForTests(): void {
  playheads.clear();
  try {
    for (const episodeListeners of listeners.values()) {
      for (const listener of episodeListeners) listener();
    }
  } finally {
    listeners.clear();
  }
}
