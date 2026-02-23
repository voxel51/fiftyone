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
  useDeletedWorkingLabels,
  useDeleteWorkingLabel,
  useInitializeWorking,
  useIsLabelDeleted,
  useResetWorkingOnModeChange,
  useRestoreWorkingLabel,
  useUpdateWorkingLabel,
  useWorkingDetections,
  useWorkingDoc,
  useWorkingLabel,
  useWorkingPolylines,
  workingAtom,
  workingAtomFamily,
  workingDocSelector,
} from "./working";

// Transient store
export {
  transientAtom,
  useEndDrag,
  useIsDragInProgress,
  useStartDrag,
  useTransientCleanup,
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

// Label resolution utils
export {
  clearLastCreatedLabels,
  getDefaultLabel,
  recordLastCreatedLabel,
} from "./labelResolution";
