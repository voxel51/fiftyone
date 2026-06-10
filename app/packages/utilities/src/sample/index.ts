/**
 * The {@link Sample} model and its label-type taxonomy. The diff/reconcile
 * engine (`./diff`, `./reconcile`) and pure helpers (`./pointer`,
 * `./normalize`) are internal — import them directly for tests/reuse; only the
 * public surface below is re-exported from `@fiftyone/utilities`.
 */
export { LabelType } from "./labels";
export type { LabelData } from "./labels";
export { Sample, SampleChangeKind } from "./sample";
export type {
  SampleChange,
  SampleChangeListener,
  SampleOptions,
} from "./sample";
