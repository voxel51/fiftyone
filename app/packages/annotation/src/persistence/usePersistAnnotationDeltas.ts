import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { isGeneratedView } from "@fiftyone/state";
import { useAnnotationDeltaSupplier } from "./useAnnotationDeltaSupplier";
import { useAnnotationEventBus, usePatchSample } from "../hooks";

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
    const eventBus = useAnnotationEventBus();
    const isGenerated = useRecoilValue(isGeneratedView);

    return useCallback(async () => {
      const { deltas, metadata } = supplyAnnotationDeltas();

      if (deltas.length === 0) {
        return null;
      }

      eventBus.dispatch("annotation:persistenceInFlight");

      // For generated views (patches/clips/frames), include metadata
      // for the field-level API endpoint
      if (isGenerated && metadata) {
        return await patchSample(deltas, {
          labelId: metadata.labelId,
          labelPath: metadata.labelPath,
          opType: "mutate",
        });
      }

      // For regular samples, just send the deltas
      return await patchSample(deltas);
    }, [eventBus, isGenerated, patchSample, supplyAnnotationDeltas]);
  };
