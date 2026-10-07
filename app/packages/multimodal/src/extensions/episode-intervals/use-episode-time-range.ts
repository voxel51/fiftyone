import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { TimeWindow } from "../../ir";
import {
  getEpisodePlayhead,
  getEpisodeTimeRange,
  requestEpisodeSeek,
  subscribeEpisodePlayhead,
  subscribeEpisodeTimeRange,
} from "../../runtime";

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

/**
 * The instant the episode's grid tile is currently presenting, rebased onto the
 * episode's 0-based axis, or null when nothing is presenting or the axis is not
 * yet known.
 *
 * Published by whichever renderer owns the frame; see
 * `runtime/episode-playhead-registry`.
 */
export function useEpisodePlayheadNs(
  episodeId: string | undefined,
  range: TimeWindow | null,
): number | null {
  const subscribe = useCallback(
    (listener: () => void) =>
      episodeId
        ? subscribeEpisodePlayhead(episodeId, listener)
        : () => undefined,
    [episodeId],
  );
  const absoluteNs = useSyncExternalStore(
    subscribe,
    () => (episodeId ? getEpisodePlayhead(episodeId) : null),
    () => null,
  );
  if (absoluteNs === null || !range) return null;
  return toEpisodeRelativeNs(absoluteNs, range);
}

/**
 * Moves the tile presenting this episode to a position on the lane's axis.
 *
 * Null when there is nothing to move — no episode identity, or no published
 * time range to rebase against — so a lane can tell "not seekable yet" from
 * "seek did nothing" rather than silently swallowing a click.
 *
 * Takes episode-relative nanoseconds, which is the axis every interval and the
 * lane itself are expressed in, and rebases to the absolute clock the
 * renderer's reads are keyed by.
 */
export function useEpisodeSeek(
  episodeId: string | undefined,
  range: TimeWindow | null,
): ((episodeRelativeNs: number) => void) | null {
  return useMemo(() => {
    if (!episodeId || !range) return null;
    const spanNs = range.endNs - range.startNs;
    return (episodeRelativeNs: number) => {
      // Clamped in bigint against the published extent: a lane hit is derived
      // from a pointer position, and the rounding at either end must not ask
      // for an instant outside the recording.
      const offsetNs = BigInt(Math.max(0, Math.round(episodeRelativeNs)));
      requestEpisodeSeek(
        episodeId,
        range.startNs + (offsetNs > spanNs ? spanNs : offsetNs),
      );
    };
  }, [episodeId, range]);
}
