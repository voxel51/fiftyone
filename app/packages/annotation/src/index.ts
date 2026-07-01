export * from "./engine";
// Seam for the video-annotation surface (which owns the video-coupled
// hooks). Explicit re-exports rather than `export * from "./agents"` so the
// agents subsystem stays internal and agents' generic `InferenceResult<T>`
// wins over the providers' same-named interface on the public barrel.
export { AgentTaskType } from "./agents/types";
export type {
  AnnotationAgent,
  InferenceResult,
  MediaBitmap,
  PropagatedDetection,
  PropagationContext,
  PropagationInferenceResult,
} from "./agents/types";
export { useAgentRegistry } from "./agents/hooks/useAgentRegistry";
export { useSampleDescriptor } from "./agents/hooks/useSampleDescriptor";
export {
  useSetSegmentBitmapSource,
  type SegmentBitmapResolver,
} from "./agents/hooks/useSegmentBitmapSource";
export type { SAM2PropagationBrowserAgent } from "./agents/SAM2PropagationBrowserAgent";
export * from "./events";
export * from "./hooks";
export * from "./persistence";
export * from "./providers";
export * from "./state";
export * from "./util";
