import { useMemo } from "react";
import { useAtom } from "jotai";
import atoms from "../state";
import { SimilarityRun, DateFilterPreset, RunFilterState } from "../types";

const DAY_MS = 86_400_000;

function getDateRange(preset: DateFilterPreset): {
  start: Date | null;
  end: Date | null;
} {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  switch (preset) {
    case "today":
      return { start: startOfToday, end: null };
    case "last_7_days":
      return {
        start: new Date(startOfToday.getTime() - 7 * DAY_MS),
        end: null,
      };
    case "last_30_days":
      return {
        start: new Date(startOfToday.getTime() - 30 * DAY_MS),
        end: null,
      };
    case "older_than_30_days":
      return {
        start: null,
        end: new Date(startOfToday.getTime() - 30 * DAY_MS),
      };
    default:
      return { start: null, end: null };
  }
}

function matchesText(run: SimilarityRun, text: string): boolean {
  const lower = text.toLowerCase();
  return (
    run.run_name.toLowerCase().includes(lower) ||
    (typeof run.query === "string" &&
      run.query.toLowerCase().includes(lower)) ||
    run.brain_key.toLowerCase().includes(lower)
  );
}

function matchesDate(
  run: SimilarityRun,
  start: Date | null,
  end: Date | null
): boolean {
  if (!start && !end) return true;
  if (!run.creation_time) return false;

  const runDate = new Date(run.creation_time);
  if (start && runDate < start) return false;
  if (end && runDate > end) return false;
  return true;
}

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
