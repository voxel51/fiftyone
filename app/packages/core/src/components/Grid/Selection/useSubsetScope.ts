import * as fos from "@fiftyone/state";
import {
  useGridSelectionBoundary,
  useInvalidateSelectionScope,
  type SelectionBoundary,
} from "@fiftyone/state/src/selection";
import { useCallback } from "react";

/**
 * Opens a saved subset (or the entire dataset) as the browsing boundary.
 * Explicit tray captures are untouched; only the result scope changes.
 */
export function useOpenSubset(datasetId: string) {
  const [, setBoundary] = useGridSelectionBoundary();
  const clearTemporalTags = fos.useClearTemporalTagConstraint();
  const invalidate = useInvalidateSelectionScope(datasetId);
  return useCallback(
    (subsetId?: string, subsetScope?: SelectionBoundary["subsetScope"]) => {
      invalidate();
      clearTemporalTags();
      setBoundary({ subsetId, subsetScope });
    },
    [invalidate, clearTemporalTags, setBoundary],
  );
}
