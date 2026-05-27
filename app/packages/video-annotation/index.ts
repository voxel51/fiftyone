export { VideoAnnotationSurface } from "./src/VideoAnnotationSurface";
export { SyntheticLabelStream } from "./src/SyntheticLabelStream";
export type {
  FrameLabelSnapshot,
  SyntheticBox,
} from "./src/SyntheticLabelStream";
export { VIDEO_STREAM_ID, LABELS_STREAM_ID, MAIN_TILE_ID } from "./src/ids";
export { buildTemporalDetectionTracks } from "./src/temporalDetectionTracks";
export type {
  RawTemporalDetection,
  RawTemporalDetectionsField,
  TemporalDetectionLabelLike,
  TemporalDetectionEventData,
  BuildTemporalDetectionTracksInput,
} from "./src/temporalDetectionTracks";
