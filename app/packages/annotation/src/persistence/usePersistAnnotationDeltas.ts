import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { isGeneratedView } from "@fiftyone/state";
import { useAnnotationDeltaSupplier } from "./useAnnotationDeltaSupplier";
import { useAnnotationEventBus, usePatchSample } from "../hooks";
import { useSampleInstance } from "../state";

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
    const sample = useSampleInstance();
    const isGenerated = useRecoilValue(isGeneratedView);

    return useCallback(async () => {
      const { deltas, metadata } = supplyAnnotationDeltas();

      if (deltas.length === 0) {
        return null;
      }

      eventBus.dispatch("annotation:persistenceInFlight");

      let success: boolean;
      if (isGenerated) {
        if (!metadata) {
          console.warn(
            "Generated view persistence requires label metadata but none was provided.",
            { deltaCount: deltas.length, deltas }
          );
          return false;
        }

        success = await patchSample(deltas, {
          labelId: metadata.labelId,
          labelPath: metadata.labelPath,
          opType: "mutate",
        });
      } else {
        success = await patchSample(deltas);
      }

      if (success) {
        // Release server-owned fields (e.g. masks) the backend now owns, so the
        // frozen transient copy isn't re-emitted against the server's
        // re-encoded/relocated value on the next autosave tick.
        sample.reconcilePersisted(deltas);
      }

      return success;
    }, [eventBus, isGenerated, patchSample, sample, supplyAnnotationDeltas]);
  };
