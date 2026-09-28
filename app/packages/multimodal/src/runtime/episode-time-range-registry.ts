import type { TimeWindow } from "../ir";
import { createKeyedExternalStore } from "./keyed-external-store";

// Every hover session's first frame and every modal open republishes the same
// extent as a fresh object, so ranges are compared by value rather than woken
// through to every reader.
const ranges = createKeyedExternalStore<TimeWindow>({
  skipUnchanged: (previous, next) =>
    previous.startNs === next.startNs && previous.endNs === next.endNs,
});

/** Publishes the best known inclusive time range for one episode identity. */
export function publishEpisodeTimeRange(
  episodeId: string,
  range: TimeWindow,
): void {
  ranges.publish(episodeId, range);
}

/** Returns a stable external-store snapshot for one episode. */
export function getEpisodeTimeRange(episodeId: string): TimeWindow | null {
  return ranges.get(episodeId);
}

/** Releases a published episode range when its source is no longer retained. */
export function releaseEpisodeTimeRange(episodeId: string): void {
  ranges.release(episodeId);
}

/** Subscribes to time-range changes for one episode. */
export function subscribeEpisodeTimeRange(
  episodeId: string,
  listener: () => void,
): () => void {
  return ranges.subscribe(episodeId, listener);
}

/** Clears shared episode ranges between tests. */
export function resetEpisodeTimeRangesForTests(): void {
  ranges.resetForTests();
}
