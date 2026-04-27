import { useMemo } from "react";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { SimilarityRun, RunFilterState } from "../types";
import { DEFAULT_DATE_PRESET, OWNER_MINE } from "../constants";
import { getDateRange, matchesText, matchesDate } from "../utils";

export const FILTER_STATE_KEY = "filterState";

export const DEFAULT_FILTER_STATE: RunFilterState = {
  searchText: "",
  datePreset: DEFAULT_DATE_PRESET,
  ownerFilter: OWNER_MINE,
};

/**
 * Shared access to the panel's filter state.
 *
 * State lives in the panels' local (non-persisted) Recoil map keyed by
 * ``panelId``. When the dataset changes, the workspace loads a fresh
 * panel instance with a new ``panelId``, so the framework handles the
 * "reset on dataset change" behavior for us — no manual effect needed.
 *
 * Multiple hooks in the same panel can call this and will share state.
 */
export const usePanelFilterState = (): [
  RunFilterState,
  (state: RunFilterState) => void
] => {
  const [state, setState] = usePanelStatePartial<RunFilterState>(
    FILTER_STATE_KEY,
    DEFAULT_FILTER_STATE,
    true // local-only; filters are UI state, not server-persisted
  );
  return [state as RunFilterState, setState as (s: RunFilterState) => void];
};

export const useFilteredRuns = (
  runs: SimilarityRun[]
): {
  filteredRuns: SimilarityRun[];
  filterState: RunFilterState;
  setFilterState: (state: RunFilterState) => void;
} => {
  const [filterState, setFilterState] = usePanelFilterState();

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
