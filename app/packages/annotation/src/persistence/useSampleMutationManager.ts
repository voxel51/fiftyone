import { atom, useAtom } from "jotai";
import { Primitive } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useModalSample } from "@fiftyone/state";
import { get, isEqual } from "lodash";

/**
 * Mapping of sample path to transient values.
 */
export type MutationMap = Record<string, Primitive>;

/**
 * Centralized {@link MutationMap} for stability across hook instances.
 */
const stagedMutationsAtom = atom<MutationMap>({});

/**
 * Interface for staging sample mutations for persistence.
 */
export interface SampleMutationManager {
  /**
   * Get the sample value at the specified path.
   *
   * If a mutation is present for this path, the transient value is returned.
   * Otherwise, the current value from the modal sample is returned.
   *
   * @param path Field path
   */
  getPathValue(path: string): Primitive | null;

  /**
   * Reset the manager, clearing all internal state.
   */
  reset(): void;

  /**
   * {@link MutationMap} containing current staged path mutations.
   */
  stagedMutations: MutationMap;

  /**
   * Stage a mutation for persistence.
   *
   * @param path Field path
   * @param data New value
   */
  stageMutation(path: string, data: Primitive): void;
}

/**
 * Hook which provides a {@link SampleMutationManager} instance.
 */
export const useSampleMutationManager = (): SampleMutationManager => {
  const [stagedMutations, setStagedMutations] = useAtom(stagedMutationsAtom);
  const modalSample = useModalSample();
  const firstRenderRef = useRef(true);

  const getPathValue = useCallback(
    (path: string) => {
      if (path in stagedMutations) {
        // return current value if mutated
        return stagedMutations[path];
      } else if (modalSample?.sample) {
        // otherwise fall back to sample data
        return get(modalSample.sample, path) as Primitive;
      } else {
        return null;
      }
    },
    [modalSample?.sample, stagedMutations]
  );

  const stageMutation = useCallback(
    (path: string, data: Primitive | null) => {
      setStagedMutations((prev) => ({
        ...prev,
        [path]: data,
      }));
    },
    [setStagedMutations]
  );

  const reset = useCallback(() => {
    setStagedMutations({});
  }, [setStagedMutations]);

  const garbageCollect = useCallback(() => {
    const keysToRemove: string[] = [];

    // find keys whose values are equal to the sample
    Object.entries(stagedMutations).forEach(([path, data]) => {
      if (isEqual(get(modalSample?.sample, path), data)) {
        keysToRemove.push(path);
      }
    });

    if (keysToRemove.length > 0) {
      // remove keys
      setStagedMutations((prev) => {
        const newData = { ...prev };
        keysToRemove.forEach((key) => delete newData[key]);
        return newData;
      });
    }
  }, [modalSample?.sample, setStagedMutations, stagedMutations]);

  // clear state on sample change
  useEffect(() => {
    // avoid clearing state on first render;
    // this allows the hook to be used in multiple places without constantly
    // resetting the state.
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }

    reset();
  }, [modalSample?.sample?._id]);

  // gc stale keys when sample data changes
  useEffect(() => garbageCollect(), [modalSample?.sample]);

  return useMemo(
    () => ({
      getPathValue,
      reset,
      stagedMutations,
      stageMutation,
    }),
    [getPathValue, reset, stagedMutations, stageMutation]
  );
};
