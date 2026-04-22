import { useMemo } from "react";
import { atom, useAtom } from "jotai";
import { SimilarityRun, RunFilterState } from "../types";
import { DEFAULT_DATE_PRESET, OWNER_MINE } from "../constants";
import { getDateRange, matchesText, matchesDate } from "../utils";

// Exported so non-React callers (e.g. `useRuns.refreshRuns`) can read
// the current filter state at call time via `getDefaultStore().get(...)`.
export const filterStateAtom = atom<RunFilterState>({
  searchText: "",
  datePreset: DEFAULT_DATE_PRESET,
  ownerFilter: OWNER_MINE,
});

export const useFilteredRuns = (
  runs: SimilarityRun[]
): {
  filteredRuns: SimilarityRun[];
  filterState: RunFilterState;
  setFilterState: (state: RunFilterState) => void;
} => {
  const [filterState, setFilterState] = useAtom(filterStateAtom);

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
