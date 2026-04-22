import { useMemo } from "react";
import { atom, useAtom } from "jotai";
import { SimilarityRun, RunFilterState } from "../types";
import { DEFAULT_DATE_PRESET, OWNER_MINE } from "../constants";
import { getDateRange, matchesText, matchesDate } from "../utils";

const filterStateAtom = atom<RunFilterState>({
  searchText: "",
  datePreset: DEFAULT_DATE_PRESET,
  ownerFilter: OWNER_MINE,
});

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
        ownerFilter === OWNER_MINE &&
        currentUser &&
        run.created_by !== currentUser
      )
        return false;
      return true;
    });
  }, [runs, filterState, currentUser]);

  return { filteredRuns, filterState, setFilterState };
};
