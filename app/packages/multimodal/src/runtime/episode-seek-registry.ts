import { createKeyedExternalStore } from "./keyed-external-store";

/** One request to move a tile's preview to an instant, in absolute ns. */
export interface EpisodeSeekRequest {
  readonly timestampNs: bigint;
  /**
   * Distinguishes two requests for the same instant.
   *
   * A seek is a command, not a position: clicking the same mark twice has to
   * reach the tile twice, and a store that only holds values would swallow the
   * second one.
   */
  readonly requestId: number;
}

// Two requests are the same request only when they carry the same id; equal
// instants are still separate asks.
const seeks = createKeyedExternalStore<EpisodeSeekRequest>({
  skipUnchanged: (previous, next) => previous.requestId === next.requestId,
});

let nextRequestId = 0;

/**
 * Asks the tile presenting one episode to move its preview to `timestampNs`.
 *
 * The return leg of `episode-playhead-registry`: that one carries where the
 * tile got to out to the interval lane, and this one carries where the lane
 * was clicked back to the tile. Same seam, same reason — the lane is painted
 * by the grid's footer column, a sibling of the renderer that owns the frame,
 * so there is no React path between them.
 *
 * Absolute nanoseconds, like the playhead: the lane's own axis is
 * episode-relative, and it rebases before asking.
 */
export function requestEpisodeSeek(
  episodeId: string,
  timestampNs: bigint,
): void {
  seeks.publish(episodeId, { requestId: ++nextRequestId, timestampNs });
}

/** Returns a stable external-store snapshot for one episode. */
export function getEpisodeSeek(episodeId: string): EpisodeSeekRequest | null {
  return seeks.get(episodeId);
}

/**
 * Drops a tile's outstanding request.
 *
 * Called when the tile stops presenting: a request left behind would be
 * replayed by the next renderer to mount against the same episode.
 */
export function releaseEpisodeSeek(episodeId: string): void {
  seeks.release(episodeId);
}

/** Subscribes to seek requests for one episode. */
export function subscribeEpisodeSeek(
  episodeId: string,
  listener: () => void,
): () => void {
  return seeks.subscribe(episodeId, listener);
}

/** Clears shared episode seek requests between tests. */
export function resetEpisodeSeeksForTests(): void {
  seeks.resetForTests();
}
