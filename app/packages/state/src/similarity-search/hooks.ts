import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { clampSimilarityResultCount } from "./limits";
import {
  similaritySearchIndexes,
  similaritySearchResultCounts,
} from "./model/atoms";

/** The index remembered by quick image searches and the Similarity Search panel. */
export function useSimilaritySearchIndexPreference(datasetId: string | null) {
  const indexes = useAtomValue(similaritySearchIndexes);
  const setIndexes = useSetAtom(similaritySearchIndexes);
  const stored = datasetId ? indexes[datasetId] : undefined;
  const select = useCallback(
    (key: string) => {
      if (datasetId)
        setIndexes((current) => ({ ...current, [datasetId]: key }));
    },
    [datasetId, setIndexes],
  );
  return [typeof stored === "string" ? stored : undefined, select] as const;
}

/** The result count shared by the view bar and selection tray, per dataset. */
export function useSimilaritySearchResultCount(datasetName: string | null) {
  const counts = useAtomValue(similaritySearchResultCounts);
  const setCounts = useSetAtom(similaritySearchResultCounts);
  const stored = datasetName ? counts[datasetName] : undefined;
  const k =
    typeof stored === "number" && Number.isInteger(stored) && stored >= 1
      ? clampSimilarityResultCount(stored, 25)
      : 25;
  const change = useCallback(
    (next: number) => {
      if (!datasetName || !Number.isFinite(next)) return;
      setCounts((current) => ({
        ...current,
        [datasetName]: clampSimilarityResultCount(next, 25),
      }));
    },
    [datasetName, setCounts],
  );
  return [k, change] as const;
}
