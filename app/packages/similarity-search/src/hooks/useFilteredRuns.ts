import { useEffect, useMemo, useRef } from "react";
import { atom, useAtom } from "jotai";
import { SimilarityRun, RunFilterState } from "../types";
import { DEFAULT_DATE_PRESET, OWNER_ALL, OWNER_MINE } from "../constants";

const filterStateAtom = atom<RunFilterState>({
  searchText: "",
  datePreset: DEFAULT_DATE_PRESET,
  ownerFilter: OWNER_ALL,
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
  const defaultsApplied = useRef(false);

  // In FOE (currentUser is set), default ownerFilter to "mine"
  useEffect(() => {
    if (!defaultsApplied.current && currentUser) {
      defaultsApplied.current = true;
      setFilterState((prev) => ({
        ...prev,
        ownerFilter: OWNER_MINE,
      }));
    }
  }, [currentUser, setFilterState]);

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
