/**
 * Public production surface for episode-backed views.
 */
export { default as ModalRenderer } from "./shell/ModalRenderer";
export { default as PlaybackShell } from "./shell/PlaybackShell";
export type { PlaybackShellProps } from "./shell/PlaybackShell";
export { GridRenderer } from "./grid/GridRenderer";
export { GridStreamSelector } from "./grid/GridStreamSelector";
export { default as RightSidebar } from "./shell/RightSidebar";
export { SourcePlayback } from "./shell/SourcePlayback";
export type { SourcePlaybackProps } from "./shell/SourcePlayback";
export { sourceDisplayName } from "./shell/source-display-name";
export { getNetworkHealth } from "./playback/network-health";

export { useFrameTransforms } from "./spatial/frame-transforms/use-frame-transforms";
export type { FrameTransformResolver } from "./spatial/frame-transforms/use-frame-transforms";
