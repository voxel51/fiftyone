import { useEffect, useMemo, useRef } from "react";
import { atom, useAtom } from "jotai";
import { useRecoilValue } from "recoil";
import { datasetName as datasetNameAtom } from "@fiftyone/state";
import { SimilarityRun, RunFilterState } from "../types";
import { DEFAULT_DATE_PRESET, OWNER_MINE } from "../constants";
import { getDateRange, matchesText, matchesDate } from "../utils";

export const DEFAULT_FILTER_STATE: RunFilterState = {
  searchText: "",
  datePreset: DEFAULT_DATE_PRESET,
  ownerFilter: OWNER_MINE,
};

// Exported so non-React callers (e.g. `useRuns.refreshRuns`) can read
// the current filter state at call time via `getDefaultStore().get(...)`.
export const filterStateAtom = atom<RunFilterState>(DEFAULT_FILTER_STATE);

export const useFilteredRuns = (
  runs: SimilarityRun[]
): {
  filteredRuns: SimilarityRun[];
  filterState: RunFilterState;
  setFilterState: (state: RunFilterState) => void;
} => {
  const [filterState, setFilterState] = useAtom(filterStateAtom);

  // Reset filter state when the dataset changes so filters don't
  // bleed across datasets. The atom is module-scoped so without this
  // a previous dataset's searchText / datePreset / ownerFilter would
  // persist. Skip the very first run so we don't reset on mount.
  const datasetName = useRecoilValue(datasetNameAtom);
  const firstRunRef = useRef(true);
  const lastDatasetRef = useRef<string | null | undefined>(null);
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      lastDatasetRef.current = datasetName;
      return;
    }
    if (lastDatasetRef.current !== datasetName) {
      lastDatasetRef.current = datasetName;
      setFilterState(DEFAULT_FILTER_STATE);
    }
  }, [datasetName, setFilterState]);

  // Owner filter is applied server-side by
  // plugins/panels/similarity_search. Only date + search are applied here.
  const filteredRuns = useMemo(() => {
    const { searchText, datePreset } = filterState;
    const { start, end } = getDateRange(datePreset);

    return runs.filter((run) => {
      if (searchText && !matchesText(run, searchText)) return false;
      if (!matchesDate(run, start, end)) return false;
      return true;
    });
  }, [runs, filterState]);

  return { filteredRuns, filterState, setFilterState };
};
