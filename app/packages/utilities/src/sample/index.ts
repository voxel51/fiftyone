/**
 * The {@link Sample} model and its label-type taxonomy. The diff/reconcile
 * engine (`./diff`, `./reconcile`) and pure helpers (`./pointer`,
 * `./normalize`) are internal — import them directly for tests/reuse; only the
 * public surface below is re-exported from `@fiftyone/utilities`.
 */
export { LabelData, LabelType } from "./labels";
export { Sample, SampleOptions } from "./sample";
