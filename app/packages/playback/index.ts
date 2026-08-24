export * from "./src/lib/constants";
export * from "./src/lib/timeline/state";
export * from "./src/lib/timeline/use-create-timeline";
export * from "./src/lib/timeline/use-default-timeline-name";
export * from "./src/lib/timeline/use-frame-number";
export * from "./src/lib/timeline/use-timeline";
export * from "./src/lib/timeline/use-timeline-viz-utils";
export * from "./src/lib/timeline/utils";
export * from "./src/lib/playback/PlaybackProvider";
export * from "./src/lib/playback/playback-store-context";
export * from "./src/lib/playback/use-playback-state";
export * from "./src/lib/playback/use-stream";
export * from "./src/lib/playback/store-access";
export type {
  BufferedRanges,
  BufferingStream,
  PlaybackStore,
  PlaybackInspectionMarker,
  PlaybackStream,
  SeekEvent,
  TimelineMode,
} from "./src/lib/playback/types";
export * from "./src/lib/tracks/TrackProvider";
export * from "./src/views/Timeline/Timeline";
export { default as TimelineWithTracks } from "./src/views/TimelineWithTracks/TimelineWithTracks";
export type {
  TimelineTracksScroller,
  TimelineWithTracksProps,
} from "./src/views/TimelineWithTracks/TimelineWithTracks";
export type {
  NormalizedEvent,
  TrackEventMenuItem,
} from "./src/views/TimelineTrack/TimelineTrack";
export type {
  TemporalTagCreatePayload,
  TemporalTagUpdatePayload,
} from "./src/views/TemporalTag/TemporalTagContext";
export { default as TemporalTagTimeline } from "./src/views/TemporalTag/TemporalTagTimeline";
export type { TemporalTagTimelineProps } from "./src/views/TemporalTag/TemporalTagTimeline";

// Continuous-time playback runtime surface consumed by feature packages
// (e.g. @fiftyone/video-annotation) — exposed here so consumers don't reach
// into `src/lib/...` directly. (TimelineWithTracks + PlaybackStore are already
// re-exported above / via the `export *` lines.)
export {
  PlaybackProvider,
  useMode,
  usePlayback,
} from "./src/lib/playback/PlaybackProvider";
export {
  useCurrentTime,
  useDuration,
  useIsPlaying,
  usePlayhead,
} from "./src/lib/playback/use-playback-state";
export {
  createTimelineDisplayConversion,
  useTimelineDisplay,
} from "./src/lib/playback/timeline-display";
export type {
  TimelineDisplayConversion,
  TimelineDisplayValue,
} from "./src/lib/playback/timeline-display";
export { usePlaybackStream } from "./src/lib/playback/use-playback-stream";
export type { AudioAvailability } from "./src/lib/playback/atoms";
export { useAudioStream } from "./src/lib/playback/use-audio-stream";
export {
  usePresentedMediaTime,
  useVideoStream,
} from "./src/lib/playback/use-video-stream";
export { useVideoSync } from "./src/lib/playback/use-video-sync";
export { useActivateStream, useStream } from "./src/lib/playback/use-stream";
export { frameAt } from "./src/lib/playback/utils";
export { PlaybackStreamBase } from "./src/lib/playback/stream-base";
export type { BufferReadiness } from "./src/lib/playback/types";
export { TrackProvider } from "./src/lib/tracks/TrackProvider";
export type { Track, TrackEvent } from "./src/lib/tracks/TrackProvider";
export * from "./src/utils/usePointerLockDrag";
