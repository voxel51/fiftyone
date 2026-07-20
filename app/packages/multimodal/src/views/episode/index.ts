/**
 * Public production surface for episode-backed views.
 */
export { default as EpisodeModalRenderer } from "./shell/EpisodeModalRenderer";
export { GridRenderer } from "./grid/GridRenderer";
export { EpisodeGridStreamSelector } from "./grid/EpisodeGridStreamSelector";
export { EpisodeSourcePlayback } from "./shell/EpisodeSourcePlayback";
export type { EpisodeSourcePlaybackProps } from "./shell/EpisodeSourcePlayback";
export { episodeSourceDisplayName } from "./shell/episode-source-display-name";
export { getEpisodeNetworkHealth } from "./playback/episode-network-health";

export { useEpisodeFrameTransforms } from "./scene/use-episode-frame-transforms";
export type { EpisodeFrameTransformResolver } from "./scene/use-episode-frame-transforms";
