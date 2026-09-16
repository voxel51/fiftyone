import * as fos from "@fiftyone/state";
import {
  subsetRequest,
  useEpisodeSelectionActions,
  useGridSelectionBoundary,
  useGridSelectionDataset,
  useInvalidateSelectionScope,
  useSelectionScopeRevision,
  type SavedSubset,
  type SelectionBoundary,
  type SelectionCounts,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";
import { useCallback, useEffect, useState } from "react";

/**
 * Opens a saved subset (or the entire dataset) as the browsing boundary. A
 * fresh scope starts without captures: a selection made in one scope must
 * never silently become the target of actions in another.
 */
export function useOpenSubset(datasetId: string) {
  const { domainId } = useGridSelectionDataset();
  const [, setBoundary] = useGridSelectionBoundary();
  const { clear } = useEpisodeSelectionActions(domainId);
  const clearTemporalTags = fos.useClearTemporalTagConstraint();
  const invalidate = useInvalidateSelectionScope(datasetId);
  return useCallback(
    (subsetId?: string, subsetScope?: SelectionBoundary["subsetScope"]) => {
      invalidate();
      clearTemporalTags();
      clear();
      setBoundary({ subsetId, subsetScope });
    },
    [invalidate, clearTemporalTags, clear, setBoundary],
  );
}

/** The dataset's saved subsets, reloaded after every subset write. */
export function useSavedSubsets(datasetId: string) {
  const revision = useSelectionScopeRevision(datasetId);
  const [subsets, setSubsets] = useState<readonly SavedSubset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const reload = useCallback(() => setReloads((count) => count + 1), []);
  // This effect fetches the subset list, and again whenever a subset write
  // bumps the scope revision or a caller asks for a reload.
  useEffect(() => {
    if (!datasetId) return undefined;
    let active = true;
    subsetRequest<{ subsets: SavedSubset[] }>(datasetId, "")
      .then((value) => {
        if (!active) return;
        setSubsets(value.subsets);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setSubsets([]);
        setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [datasetId, revision, reloads]);
  return { subsets, error, reload };
}

/** The scope a subset opens in when the caller does not choose one. */
export function defaultSubsetScope(
  counts: SelectionCounts,
): NonNullable<SelectionBoundary["subsetScope"]> {
  return counts.segments > 0 && counts.fullEpisodes === 0
    ? "segments"
    : "episodes";
}

/** One scope-menu row per way a subset can be browsed, with what each holds. */
export function subsetRows(subset: SavedSubset, unit: SelectionUnit) {
  const { fullEpisodes, segments, unavailable } = subset.counts;
  const note = unavailable ? ` · ${unavailable} unavailable` : "";
  const rows: {
    scope: NonNullable<SelectionBoundary["subsetScope"]>;
    count: number;
    subtitle: string;
  }[] = [];
  if (fullEpisodes > 0 || segments === 0)
    rows.push({
      scope: "episodes",
      count: fullEpisodes,
      subtitle:
        (segments > 0
          ? `Saved selection · whole ${unit.many}`
          : "Saved selection") + note,
    });
  if (segments > 0)
    rows.push({
      scope: "segments",
      count: segments,
      subtitle: `Saved selection · segments${note}`,
    });
  return rows;
}
