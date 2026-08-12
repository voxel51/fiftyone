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
  publishMcapEmbeddingSelection,
  useMcapEmbeddingSelectionSnapshot,
  useSampleRendererEmbeddingWindows,
  useSampleRendererFirstMatch,
  type EmbeddingWindow,
  type McapEmbeddingSelection,
  type McapEmbeddingWindowMark,
} from "./embedding-selection";
// Edition-contributed grid-tile overlays, rendered by the shared grid
export {
  registerMcapGridOverlay,
  useMcapGridOverlays,
  type McapGridOverlayComponent,
} from "./grid-overlay-registry";
// Shared episode-source plumbing an edition overlay renders through; an
// edition reaches shared runtime/view modules only via this facade
export {
  getSourceBootstrapSnapshot,
  subscribeSourceBootstrap,
} from "../../runtime/source-bootstrap-cache";
export { useStableEpisodeSource } from "../../views/session/use-stable-episode-source";
export { default as timeLaneOverlayStyles } from "../../temporal-tags/grid-overlay.module.css";
