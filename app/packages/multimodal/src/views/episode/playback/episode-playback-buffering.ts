import {
  setBufferedRanges,
  setBufferingDetail,
  setIsBuffering,
  type PlaybackStore,
} from "@fiftyone/playback";

/** Clears episode-owned playback buffering feedback during source transitions. */
export function resetEpisodePlaybackBuffering(store: PlaybackStore): void {
  setBufferingDetail(store, null);
  setIsBuffering(store, false);
  setBufferedRanges(store, []);
}
