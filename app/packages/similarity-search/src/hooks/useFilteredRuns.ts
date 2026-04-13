import { useMemo } from "react";
import { atom, useAtom } from "jotai";
import { SimilarityRun, RunFilterState } from "../types";

const filterStateAtom = atom<RunFilterState>({
  searchText: "",
  datePreset: "all",
  ownerFilter: "all",
});
import { getDateRange, matchesText, matchesDate } from "../utils";

export const useFilteredRuns = (
  runs: SimilarityRun[],
  currentUser?: string | null,
  canManage = true
): {
  filteredRuns: SimilarityRun[];
  filterState: RunFilterState;
  setFilterState: (state: RunFilterState) => void;
} => {
  const [filterState, setFilterState] = useAtom(filterStateAtom);

  const filteredRuns = useMemo(() => {
    const { searchText, datePreset, ownerFilter } = filterState;
    const { start, end } = getDateRange(datePreset);

    // Users without manage permission can only see their own searches
    const effectiveOwnerFilter =
      !canManage && currentUser ? "mine" : ownerFilter;

    return runs.filter((run) => {
      if (searchText && !matchesText(run, searchText)) return false;
      if (!matchesDate(run, start, end)) return false;
      if (
        effectiveOwnerFilter === "mine" &&
        currentUser &&
        run.created_by !== currentUser
      )
        return false;
      return true;
    });
  }, [runs, filterState, currentUser, canManage]);

  return { filteredRuns, filterState, setFilterState };
};
