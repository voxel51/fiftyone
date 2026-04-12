import { useEffect, useMemo, useRef } from "react";
import { atom, useAtom } from "jotai";
import { SimilarityRun, RunFilterState } from "../types";
import { DEFAULT_DATE_PRESET, OWNER_ALL, OWNER_MINE } from "../constants";
import { getDateRange, matchesText, matchesDate } from "../utils";

const makeDefaultFilterState = (
  currentUser?: string | null
): RunFilterState => ({
  searchText: "",
  datePreset: DEFAULT_DATE_PRESET,
  ownerFilter: currentUser ? OWNER_MINE : OWNER_ALL,
});

const filterStateAtom = atom<RunFilterState>(makeDefaultFilterState());

export const useFilteredRuns = (
  runs: SimilarityRun[],
  currentUser?: string | null,
  datasetName?: string | null
): {
  filteredRuns: SimilarityRun[];
  filterState: RunFilterState;
  setFilterState: (state: RunFilterState) => void;
} => {
  const [filterState, setFilterState] = useAtom(filterStateAtom);
  const prevDatasetRef = useRef<string | null | undefined>(undefined);

  // Reset filter state when dataset changes or on first mount
  useEffect(() => {
    if (
      prevDatasetRef.current !== undefined &&
      prevDatasetRef.current !== datasetName
    ) {
      setFilterState(makeDefaultFilterState(currentUser));
    }
    prevDatasetRef.current = datasetName;
  }, [datasetName, currentUser, setFilterState]);

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
