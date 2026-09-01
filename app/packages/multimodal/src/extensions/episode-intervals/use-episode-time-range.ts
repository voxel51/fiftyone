import { useCallback, useSyncExternalStore } from "react";
import type { TimeWindow } from "../../ir";
import { getEpisodeTimeRange, subscribeEpisodeTimeRange } from "../../runtime";

/**
 * The episode's time axis, once the active format has published it.
 *
 * Every interval source needs this, for two reasons the shared shape cannot
 * paper over. Sources whose spans are absolute wall-clock nanoseconds — which
 * is what the projection grains store — must rebase onto the 0-based axis
 * `EpisodeInterval` is defined in, and doing that against the wrong origin
 * puts a mark decades away rather than slightly off. Sources whose condition
 * holds for the whole episode with no span of its own need the extent to draw
 * anything at all.
 *
 * Null until the range is known: a tile renders before its preview read
 * resolves, and a source must contribute nothing rather than guess an origin.
 */
export function useEpisodeTimeRange(
  episodeId: string | undefined,
): TimeWindow | null {
  const subscribe = useCallback(
    (listener: () => void) =>
      episodeId
        ? subscribeEpisodeTimeRange(episodeId, listener)
        : () => undefined,
    [episodeId],
  );
  return useSyncExternalStore(
    subscribe,
    () => (episodeId ? getEpisodeTimeRange(episodeId) : null),
    () => null,
  );
}

/**
 * Rebases an absolute nanosecond instant onto the episode's 0-based axis.
 *
 * The subtraction is done in `bigint` because absolute epoch nanoseconds
 * exceed `Number.MAX_SAFE_INTEGER` by two orders of magnitude; the *result*
 * is safely a number, since it is bounded by the recording's duration.
 */
export function toEpisodeRelativeNs(
  absoluteNs: bigint,
  range: TimeWindow,
): number {
  return Number(absoluteNs - range.startNs);
}
