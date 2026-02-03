// =============================================================================
// Architecture:
//
//   BASELINE (modalSample) → WORKING (local edits) → TRANSIENT (drag previews)
//                                    |
//                             PERSISTENCE
//
// - Baseline: Use modalSample.sample directly
// - Working: Authoritative state for persistence delta computation
// - Transient: Ephemeral interaction state (NOT persisted)
//
//  renderModel = derive(working.doc, transient)
//
// =============================================================================

export * from "./types";

// Working store
export {
  useAddWorkingLabel,
  useDeleteWorkingLabel,
  useInitializeWorking,
  useIsLabelDeleted,
  useIsWorkingDirty,
  useResetWorkingOnModeChange,
  useRestoreWorkingLabel,
  useUpdateWorkingLabel,
  useWorkingDetections,
  useWorkingDoc,
  useWorkingLabel,
  useWorkingPolylines,
  workingAtom,
  workingAtomFamily,
  workingDirtyAtom,
  workingDocSelector,
} from "./working";

// Transient store
export {
  transientAtom,
  useEndDrag,
  useIsDragInProgress,
  useStartDrag,
  useTransientCuboid,
  useTransientPolyline,
  useTransientStore,
  useUpdateTransient,
} from "./transient";

// Render model
export {
  deriveRenderModel,
  renderModelSelector,
  useIsWorkingInitialized,
  useRenderDetection,
  useRenderModel,
  useRenderPolyline,
} from "./renderModel";

// Operations
export { useCuboidOperations, usePolylineOperations } from "./operations";
