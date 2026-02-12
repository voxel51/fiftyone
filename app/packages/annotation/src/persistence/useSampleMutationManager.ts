import { useModalSample, useModalSampleSchema } from "@fiftyone/state";
import { Primitive } from "@fiftyone/utilities";
import { atom, useAtom } from "jotai";
import { get, isEqual } from "lodash";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Mutation } from "../types";
import {
  arePrimitivesEqual,
  getFieldSchema,
  isPrimitiveFieldType,
} from "../util";

/**
 * Mapping of sample path to transient values.
 */
export type MutationMap = Record<string, Mutation>;

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
  stageMutation(path: string, mutation: Mutation): void;
}

/**
 * Hook which provides a {@link SampleMutationManager} instance.
 */
export const useSampleMutationManager = (): SampleMutationManager => {
  const [stagedMutations, setStagedMutations] = useAtom(stagedMutationsAtom);
  const modalSample = useModalSample();
  const modalSampleSchema = useModalSampleSchema();
  const firstRenderRef = useRef(true);

  const getPathValue = useCallback(
    (path: string) => {
      if (path in stagedMutations) {
        // return current value if mutated
        return stagedMutations[path].data as Primitive;
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
    (path: string, mutation: Mutation) => {
      setStagedMutations((prev) => ({
        ...prev,
        [path]: mutation,
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
    Object.entries(stagedMutations).forEach(([path, mutation]) => {
      const data = mutation.data as Primitive;
      // primitives require custom comparator to handle types like dates
      if (isPrimitiveFieldType(getFieldSchema(modalSampleSchema, path))) {
        if (
          arePrimitivesEqual(get(modalSample?.sample, path) as Primitive, data)
        ) {
          keysToRemove.push(path);
        }
      } else if (isEqual(get(modalSample?.sample, path), data)) {
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
  }, [
    modalSample?.sample,
    modalSampleSchema,
    setStagedMutations,
    stagedMutations,
  ]);

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
