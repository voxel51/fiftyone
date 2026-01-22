import { useCallback } from "react";
import { useAnnotationDeltaSupplier } from "./useAnnotationDeltaSupplier";
import { usePatchSample } from "../hooks";

/**
 * @returns `true` if persistence was successful
 * @returns `false` if persistence was unsuccessful
 * @returns `null` if no changes were pending
 */
type PersistenceResult = boolean | null;

/**
 * Hook which provides a callback to persist all pending annotation deltas.
 *
 * @returns A callback that persists annotation deltas and returns:
 *   - `true` if persistence was successful
 *   - `false` if persistence was unsuccessful
 *   - `null` if no changes were pending
 */
export const usePersistAnnotationDeltas =
  (): (() => Promise<PersistenceResult>) => {
    const supplyAnnotationDeltas = useAnnotationDeltaSupplier();
    const patchSample = usePatchSample();

    return useCallback(async () => {
      const sampleDeltas = supplyAnnotationDeltas();

      if (sampleDeltas.length > 0) {
        return await patchSample(sampleDeltas);
      }

      return null;
    }, [patchSample, supplyAnnotationDeltas]);
  };
