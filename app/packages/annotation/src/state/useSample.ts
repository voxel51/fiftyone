import { Sample } from "@fiftyone/utilities";
import { atom, useAtomValue } from "jotai";
import { useSyncExternalStore } from "react";

/**
 * Shared {@link Sample} for the currently open modal sample.
 *
 * The instance is mutated in place — components subscribe to its changes via
 * {@link useSample} / {@link useSampleSelector}, which adapt the Sample's
 * `subscribe`/`getVersion` API to `useSyncExternalStore`.
 *
 * Lifecycle (source data, schema, reset on sample id change) is owned by
 * {@link useSyncModalSample}.
 */
const sampleAtom = atom(new Sample());

/**
 * Get the shared {@link Sample} without subscribing to its mutations. The
 * returned instance is stable — use this from callbacks and event handlers
 * that only need to read on demand. Prefer {@link useSample} when the
 * component should re-render on every change.
 */
export const useSampleInstance = (): Sample => useAtomValue(sampleAtom);

/**
 * Subscribe to the shared {@link Sample}. The component re-renders whenever
 * the sample mutates (source data, schema, transient edits).
 */
export const useSample = (): Sample => {
  const sample = useAtomValue(sampleAtom);
  useSyncExternalStore(sample.subscribe, sample.getVersion, sample.getVersion);

  return sample;
};

/**
 * Select a value out of the shared {@link Sample}, re-evaluating whenever the
 * sample mutates. Prefer this over {@link useSample} when only a derived value
 * is needed; rendering remains cheap as long as the selector is fast.
 */
export const useSampleSelector = <T>(selector: (s: Sample) => T): T => {
  const sample = useAtomValue(sampleAtom);
  useSyncExternalStore(sample.subscribe, sample.getVersion, sample.getVersion);

  return selector(sample);
};
