export * from "./src/lib/constants";
export * from "./src/lib/timeline/state";
export * from "./src/lib/timeline/use-create-timeline";
export * from "./src/lib/timeline/use-default-timeline-name";
export * from "./src/lib/timeline/use-frame-number";
export * from "./src/lib/timeline/use-timeline";
export * from "./src/lib/timeline/use-timeline-viz-utils";
export * from "./src/lib/timeline/utils";
export * from "./src/lib/playback/PlaybackProvider";
export * from "./src/lib/playback/atoms";
export * from "./src/lib/playback/playback-store-context";
export type { PlaybackStore, PlaybackStream } from "./src/lib/playback/types";
export * from "./src/lib/tracks/TrackProvider";
export * from "./src/views/Timeline/Timeline";
export { default as TimelineWithTracks } from "./src/views/TimelineWithTracks/TimelineWithTracks";
export type { TimelineWithTracksProps } from "./src/views/TimelineWithTracks/TimelineWithTracks";
export type {
  NormalizedEvent,
  TrackEventMenuItem,
} from "./src/views/TimelineTrack/TimelineTrack";
export type { TemporalTagCreatePayload } from "./src/views/TemporalTag/TemporalTagContext";
export { default as TemporalTagTimeline } from "./src/views/TemporalTag/TemporalTagTimeline";
export type { TemporalTagTimelineProps } from "./src/views/TemporalTag/TemporalTagTimeline";

// Continuous-time playback runtime surface consumed by feature packages
// (e.g. @fiftyone/video-annotation) — exposed here so consumers don't reach
// into `src/lib/...` directly. (TimelineWithTracks + PlaybackStore are already
// re-exported above / via the `export *` lines.)
export {
  PlaybackProvider,
  usePlayback,
} from "./src/lib/playback/PlaybackProvider";
export {
  useCurrentTime,
  useDuration,
  useIsPlaying,
  usePlayhead,
} from "./src/lib/playback/use-playback-state";
export { usePlaybackStream } from "./src/lib/playback/use-playback-stream";
export {
  usePresentedMediaTime,
  useVideoStream,
} from "./src/lib/playback/use-video-stream";
export { useVideoSync } from "./src/lib/playback/use-video-sync";
export { useStream } from "./src/lib/playback/use-stream";
export { frameAt } from "./src/lib/playback/utils";
export { PlaybackStreamBase } from "./src/lib/playback/stream-base";
export type { BufferReadiness } from "./src/lib/playback/types";
export { TrackProvider } from "./src/lib/tracks/TrackProvider";
export type { Track, TrackEvent } from "./src/lib/tracks/TrackProvider";
