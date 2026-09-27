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
// The embedding-window selection crosses this seam as a plain external store:
// an edition PUBLISHES into it and the shared renderers read it through the
// hooks here — inert (empty) until something publishes
export {
  firstMatchWindow,
  publishEmbeddingSelection,
  useEmbeddingSelectionSnapshot,
  useSampleRendererEmbeddingWindows,
  useSampleRendererFirstMatch,
  type EmbeddingWindow,
  type EmbeddingSelection,
  type EmbeddingWindowMark,
} from "./embedding-selection";
// Edition-contributed grid-tile overlays, rendered by the shared grid
export {
  registerGridOverlay,
  useGridOverlays,
  type GridOverlayComponent,
} from "./grid-overlay-registry";
