/**
 * Public production surface for episode-backed views.
 */
export { default as ModalRenderer } from "./shell/ModalRenderer";
export { GridRenderer } from "./grid/GridRenderer";
export { GridStreamSelector } from "./grid/GridStreamSelector";
export { SourcePlayback } from "./shell/SourcePlayback";
export type { SourcePlaybackProps } from "./shell/SourcePlayback";
export { sourceDisplayName } from "./shell/source-display-name";
export { getNetworkHealth } from "./playback/network-health";

export { useFrameTransforms } from "./spatial/frame-transforms/use-frame-transforms";
export type { FrameTransformResolver } from "./spatial/frame-transforms/use-frame-transforms";
