/**
 * The {@link Sample} model and its label-type taxonomy. The diff/reconcile
 * engine (`./diff`, `./reconcile`) and pure helpers (`./pointer`) are
 * internal — import them directly for tests/reuse; only the public surface
 * below is re-exported from `@fiftyone/utilities`.
 */
export { isListLabelType, LabelType, LIST_LABEL_CHILD } from "./labels";
export type { LabelData } from "./labels";
// Id-aligned list-delta builder (shift-safe JSON-Patch for label lists); shared
// by per-frame video labels and temporal detections.
export { idAlignedListDelta } from "./diff";
export type { IdAlignedDeltaSpec } from "./diff";
// Apply JSON-Patch deltas to a document (server-faithful re-baseline primitive).
export { applyDeltas } from "./apply";
// Sample's canonical value-equality (collapses DateTime shapes); reused by
// reconcilers to decide whether a change is a no-op echo of Sample's truth.
export { equalsNormalized } from "./normalize";
export { Sample, SampleChangeKind } from "./sample";
export type {
  SampleChange,
  SampleChangeListener,
  SampleOptions,
  TransientSnapshot,
} from "./sample";
