export { McapTimelineExtensionHost } from "./host";
export {
  registerMcapTimelineExtension,
  useMcapTimelineExtensions,
} from "./registry";
export {
  McapAnnotationTopicsProvider,
  useMcapSelectedAnnotationTopics,
  usePublishMcapAnnotationTopics,
} from "./selected-annotation-topics";
export type {
  McapTimelineComposition,
  McapTimelineContribution,
  McapTimelineExtension,
  McapTimelineExtensionComponentProps,
  McapTimelineExtensionContext,
  McapTimelinePreferences,
  McapTimelineSection,
  McapTimelineTrackDecorator,
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
// Shared mcap-source plumbing an edition overlay renders through; enterprise
// reaches shared adapter modules only via this facade
export {
  getMcapSourceBootstrapSnapshot,
  subscribeMcapSourceBootstrap,
} from "../../adapters/mcap/source-bootstrap-cache";
export { useStableMcapSource } from "../../adapters/mcap/react/use-stable-mcap-source";
export { default as timeLaneOverlayStyles } from "../../adapters/mcap/react/TemporalTagGridOverlay.module.css";
