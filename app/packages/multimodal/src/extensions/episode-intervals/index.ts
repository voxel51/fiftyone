/**
 * Episode intervals: the shared seam through which anything that holds over a
 * span of an episode reaches the grid tile's lane and the modal timeline.
 *
 * Open source contributes one source (temporal tags). Enterprise concepts —
 * events, label tags, signals, summaries — register their own and get the tile
 * lane, the timeline section, and filter pre-pinning without either side
 * knowing about the other.
 */
export { EpisodeIntervalSources } from "./chain";
export {
  toEpisodeRelativeNs,
  useEpisodePlayheadNs,
  useEpisodeTimeRange,
} from "./use-episode-time-range";
export { packIntervals, UNPLACED } from "./pack-intervals";
export {
  intervalPinnedTrackIds,
  intervalTimelineSections,
  intervalTrackId,
  intervalsToTracks,
} from "./intervals-to-tracks";
export {
  registerEpisodeIntervalSource,
  useEpisodeIntervalSources,
} from "./registry";
export type {
  EpisodeInterval,
  EpisodeIntervalContribution,
  EpisodeIntervalSource,
  EpisodeIntervalSourceProps,
  ResolvedEpisodeIntervals,
} from "./types";
export type { PackableInterval, PackedIntervals } from "./pack-intervals";
