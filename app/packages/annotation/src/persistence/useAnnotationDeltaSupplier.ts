import { isPatchesView } from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { useSampleInstance } from "../state";
import type { DeltaSupplier } from "./deltaSupplier";

/**
 * Hook which provides a {@link DeltaSupplier} for all annotation sources.
 *
 * Sidebar, Lighter (2D), and 3D edits are all tracked on the shared
 * {@link Sample} instance (via `useSyncModalSample` / the engine's Lighter
 * bridge / `useSync3dSample`) and emitted through `sample.getJsonPatch()`.
 *
 * For generated (patches) views the patch is emitted as a single-element diff
 * and routed via `sample.firstEditedLabel()` metadata.
 */
export const useAnnotationDeltaSupplier = (): DeltaSupplier => {
  const sample = useSampleInstance();
  const isGenerated = useRecoilValue(isPatchesView);

  return useCallback(() => {
    const deltas = sample.getJsonPatch({ isGenerated });

    // Generated views require label metadata so the backend can update the
    // source sample; it comes from the first edited label on the Sample.
    const metadata = isGenerated
      ? sample.firstEditedLabel({ isGenerated: true })
      : undefined;

    return { deltas, metadata };
  }, [isGenerated, sample]);
};
