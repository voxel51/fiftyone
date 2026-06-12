import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import {
  generatedDatasetName as generatedDatasetNameAtom,
  isGeneratedView,
  useCurrentDatasetId,
  useModalSample,
  useUpdateSamples,
} from "@fiftyone/state";
import type { Sample } from "@fiftyone/looker";
import { useAnnotationDeltaSupplier } from "./useAnnotationDeltaSupplier";
import { useAnnotationEventBus } from "../hooks";
import { saveAnnotationChanges } from "../util";

type PersistenceResult = boolean | null;

/**
 * Returns a callback that flushes captured annotation changes (original value
 * + updated value per change) to the server; resolves to `null` if there was
 * nothing to persist.
 */
export const usePersistAnnotationDeltas =
  (): (() => Promise<PersistenceResult>) => {
    const supplyDeltas = useAnnotationDeltaSupplier();
    const eventBus = useAnnotationEventBus();
    const datasetId = useCurrentDatasetId();
    const sample = useModalSample()?.sample;
    const updateSamples = useUpdateSamples();
    const isGenerated = useRecoilValue(isGeneratedView);
    const generatedDatasetName = useRecoilValue(generatedDatasetNameAtom);

    return useCallback(async () => {
      const { deltas } = supplyDeltas();

      if (deltas.length === 0) {
        return null;
      }

      if (!datasetId || !sample?._id) {
        return false;
      }

      eventBus.dispatch("annotation:persistenceInFlight");

      return saveAnnotationChanges(deltas, {
        datasetId,
        sample,
        // In-place tile/modal update (no grid refresh).
        updateSample: (updated: Sample) =>
          updateSamples([[updated._id, updated]]),
        isGenerated,
        generatedDatasetName: generatedDatasetName ?? undefined,
      });
    }, [
      supplyDeltas,
      datasetId,
      sample,
      updateSamples,
      isGenerated,
      generatedDatasetName,
      eventBus,
    ]);
  };
