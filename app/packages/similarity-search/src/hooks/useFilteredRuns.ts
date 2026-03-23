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
  currentUser?: string | null
): {
  filteredRuns: SimilarityRun[];
  filterState: RunFilterState;
  setFilterState: (state: RunFilterState) => void;
} => {
  const [filterState, setFilterState] = useAtom(filterStateAtom);

  const filteredRuns = useMemo(() => {
    const { searchText, datePreset, ownerFilter } = filterState;
    const { start, end } = getDateRange(datePreset);

    return runs.filter((run) => {
      if (searchText && !matchesText(run, searchText)) return false;
      if (!matchesDate(run, start, end)) return false;
      if (
        ownerFilter === "mine" &&
        currentUser &&
        run.created_by !== currentUser
      )
        return false;
      return true;
    });
  }, [runs, filterState, currentUser]);

  return { filteredRuns, filterState, setFilterState };
};
