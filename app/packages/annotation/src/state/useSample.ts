import { useModalSample } from "@fiftyone/state";
import { Sample } from "@fiftyone/utilities";
import { atom, useAtomValue, useStore } from "jotai";
import { atomFamily } from "jotai/utils";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Shared {@link Sample} instances, one per modal sample id.
 *
 * A grouped modal renders more than one sample at once (the selected 2D slice
 * plus the pinned 3D slice), each a distinct sample document. Each gets its
 * own {@link Sample} so a surface's edits land in that sample's store and
 * never bleed across the slice boundary. The instance is mutated in place;
 * components subscribe to its changes through {@link useSample} /
 * {@link useSampleSelector}.
 *
 * Lifecycle (source data, schema, reset on sample id change) is owned by the
 * sync hooks — {@link useSyncModalSample} for the selected slice, the 3D sync
 * for the pinned slice.
 */
const sampleFamily = atomFamily((_sampleId: string) => atom(new Sample()));

/** Sentinel key when no modal sample is open. */
const NO_SAMPLE = "";

/** The currently selected modal slice's sample id, or the sentinel. */
const useActiveSampleId = (): string =>
  useModalSample()?.sample?._id ?? NO_SAMPLE;

/**
 * Get a {@link Sample} instance without subscribing to its mutations. The
 * returned instance is stable for a given sample id — use this from callbacks
 * and event handlers that only need to read on demand. Prefer {@link useSample}
 * when the component should re-render on every change.
 *
 * Pass an explicit `sampleId` to address a specific slice's sample (e.g. the
 * 3D surface, which is not the selected slice); omit it for the selected slice.
 */
export const useSampleInstance = (sampleId?: string): Sample => {
  const activeId = useActiveSampleId();
  return useAtomValue(sampleFamily(sampleId ?? activeId));
};

/**
 * Get a stable getter that resolves a {@link Sample} instance by id without
 * subscribing. For hooks that must address a dynamic set of samples (the
 * engine store registration) where a fixed number of {@link useSampleInstance}
 * calls won't do.
 */
export const useSampleInstanceGetter = (): ((sampleId: string) => Sample) => {
  const store = useStore();
  return useCallback(
    (sampleId: string) => store.get(sampleFamily(sampleId)),
    [store]
  );
};

/**
 * Subscribe to a {@link Sample}. The component re-renders whenever the sample
 * mutates (source data, schema, transient edits) or the selected slice changes.
 */
export const useSample = (sampleId?: string): Sample => {
  const activeId = useActiveSampleId();
  const sample = useAtomValue(sampleFamily(sampleId ?? activeId));
  useSyncExternalStore(sample.subscribe, sample.getVersion, sample.getVersion);

  return sample;
};

/**
 * Select a value out of a {@link Sample}, re-evaluating whenever the sample
 * mutates. Prefer this over {@link useSample} when only a derived value is
 * needed; rendering remains cheap as long as the selector is fast.
 */
export const useSampleSelector = <T>(
  selector: (s: Sample) => T,
  sampleId?: string
): T => {
  const activeId = useActiveSampleId();
  const sample = useAtomValue(sampleFamily(sampleId ?? activeId));
  useSyncExternalStore(sample.subscribe, sample.getVersion, sample.getVersion);

  return selector(sample);
};
