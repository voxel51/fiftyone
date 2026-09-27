export { TimelineExtensionHost } from "./host";
export { registerTimelineExtension, useTimelineExtensions } from "./registry";
export {
  AnnotationStreamsProvider,
  useSelectedAnnotationStreams,
  usePublishAnnotationStreams,
} from "./selected-annotation-streams";
export type {
  TimelineComposition,
  TimelineContribution,
  TimelineExtension,
  TimelineExtensionComponentProps,
  TimelineExtensionContext,
  TimelinePreferences,
  TimelineSection,
  TimelineTrackDecorator,
} from "./types";
export {
  publishSampleFocus,
  useSampleFocus,
  type ResolvedSampleFocus,
  type SampleFocus,
} from "./sample-focus";
// Edition-contributed grid-tile overlays, rendered by the shared grid
export {
  registerGridOverlay,
  useGridOverlays,
  type GridOverlayComponent,
} from "./grid-overlay-registry";
