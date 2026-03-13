import { useMemo } from "react";
import { useAtom } from "jotai";
import atoms from "../state";
import { SimilarityRun, RunFilterState } from "../types";
import { getDateRange, matchesText, matchesDate } from "../utils";

export const useFilteredRuns = (
  runs: SimilarityRun[]
): {
  filteredRuns: SimilarityRun[];
  filterState: RunFilterState;
  setFilterState: (state: RunFilterState) => void;
} => {
  const [filterState, setFilterState] = useAtom(atoms.filterState);

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
