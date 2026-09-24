export { VideoAnnotationSurface } from "./src/components/VideoAnnotationSurface";
export { useVfcClockSource } from "./src/hooks/useVfcClockSource";
export { LighterVideo } from "./src/components/LighterVideo";
export { RegisterVideoExploreLabels } from "./src/components/RegisterVideoExploreLabels";
export { RegisterTimelineAudio } from "./src/components/RegisterTimelineAudio";
export type {
  LighterVideoMode,
  LighterVideoProps,
} from "./src/components/LighterVideo";
// Frame-label tracks. The track data is a server index fetch; the
// annotation engine only overlays unsaved edits, and its atom has a
// module-level default, so these work read-only outside Annotate mode.
export {
  FrameLabelsTracks,
  RegisterFrameLabels,
} from "./src/components/FrameLabels";
export { useDynamicGroupMemberIndex } from "./src/state/dynamicGroupMemberIndex";
export type { DynamicGroupMemberIndex } from "./src/state/dynamicGroupMemberIndex";
export { SyntheticLabelStream } from "./src/streams/SyntheticLabelStream";
export type {
  FrameLabelSnapshot,
  SyntheticBox,
} from "./src/streams/SyntheticLabelStream";
export {
  DYNAMIC_GROUP_STREAM_ID,
  LABELS_STREAM_ID,
  MAIN_TILE_ID,
  VIDEO_STREAM_ID,
} from "./src/utils/ids";
export { getModalSampleFrameRate } from "./src/utils/modalSample";
export { resolveFrameCount } from "./src/utils/frameCount";
export { useTimelineMaxSize } from "./src/hooks/useTimelineMaxSize";
export { DynamicGroupImageStream } from "./src/streams/DynamicGroupImageStream";
export type { DynamicGroupImageFrame } from "./src/streams/DynamicGroupImageStream";
export { useFrameLabelsStream } from "./src/streams/frameLabelsStream";
export {
  useDynamicGroupImageStream,
  usePublishDynamicGroupImageStream,
} from "./src/streams/dynamicGroupImageStreamHandle";
export { PropagationStatusItem } from "./src/components/PropagationStatusItem";
export { resolvePropagationTarget } from "./src/propagation/propagationTarget";
export type { PropagationTarget } from "./src/propagation/propagationTarget";
export {
  resolveTemporalDetectionSupport,
  resolveTrackExtentEdit,
} from "./src/tracks/trackExtentEdit";
export type {
  ResolveTrackExtentEditInput,
  TrackDragMode,
  TrackExtentEdit,
} from "./src/tracks/trackExtentEdit";
export { VideoFrameLabelsStream } from "./src/streams/VideoFrameLabelsStream";
export type {
  LocalDetection,
  RawDetection,
  RawDetectionsField,
} from "./src/streams/VideoFrameLabelsStream";
export { buildTemporalDetectionTracks } from "./src/tracks/temporalDetectionTracks";
export type {
  RawTemporalDetection,
  RawTemporalDetectionsField,
  TemporalDetectionLabelLike,
  TemporalDetectionEventData,
  BuildTemporalDetectionTracksInput,
} from "./src/tracks/temporalDetectionTracks";
export {
  syncTemporalOverlays,
  useTemporalOverlaySync,
} from "./src/sync/useTemporalOverlaySync";
export { useAutoInterpolate } from "./src/hooks/useAutoInterpolate";
export { useRegisterVideoAnnotationKeybindings } from "./src/hooks/useRegisterVideoAnnotationKeybindings";
