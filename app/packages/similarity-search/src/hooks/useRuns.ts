import { useAtom } from "jotai";
import { useCallback } from "react";
import atoms from "../state";
import { SimilarityRun } from "../types";
import { useFetchRuns } from "./useFetchRuns";

type UseRunsResult = {
  runs: SimilarityRun[];
  refreshRuns: () => Promise<void>;
  updateRun: (run: SimilarityRun) => void;
  removeRun: (runId: string) => void;
};

/**
 * Hook for managing similarity search runs.
 */
export const useRuns = (): UseRunsResult => {
  const [runs, setRuns] = useAtom(atoms.runs);
  const { refreshRuns, sortFn } = useFetchRuns();

  const updateRun = useCallback(
    (run: SimilarityRun) => {
      const newRuns = [...runs];
      const idx = newRuns.findIndex((r) => r.run_id === run.run_id);
      if (idx >= 0) {
        newRuns.splice(idx, 1, run);
      } else {
        newRuns.push(run);
      }
      newRuns.sort(sortFn);
      setRuns(newRuns);
    },
    [runs, sortFn, setRuns]
  );

  const removeRun = useCallback(
    (runId: string) => {
      setRuns((prev) => prev.filter((r) => r.run_id !== runId));
    },
    [setRuns]
  );

  return { runs, refreshRuns, updateRun, removeRun };
};
