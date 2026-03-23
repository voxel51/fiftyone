import { atom, useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import { useOperatorExecutor } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { datasetName as datasetNameAtom } from "@fiftyone/state";
import { SimilarityRun } from "../types";

const runsAtom = atom<SimilarityRun[]>([]);

type UseRunsResult = {
  runs: SimilarityRun[];
  loaded: boolean;
  refreshRuns: () => Promise<void>;
  updateRun: (run: SimilarityRun) => void;
  removeRun: (runId: string) => void;
};

const sortFn = (a: SimilarityRun, b: SimilarityRun) =>
  (b.creation_time ?? "").localeCompare(a.creation_time ?? "");

/**
 * Hook for managing similarity search runs.
 *
 * Owns the runs atom, handles fetching from backend, and
 * provides update/remove helpers.
 */
export const useRuns = (): UseRunsResult => {
  const [runs, setRuns] = useAtom(runsAtom);
  const [loaded, setLoaded] = useState(false);
  const initialized = useRef(false);
  const lastPanelId = useRef<string | undefined>();
  const lastDatasetName = useRef<string | null | undefined>();
  const panelId = usePanelId();
  const datasetName = useRecoilValue(datasetNameAtom);
  const { execute: fetchRuns } = useOperatorExecutor(
    "@voxel51/panels/list_similarity_runs"
  );

  const refreshRuns = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      fetchRuns(
        {},
        {
          callback: (result?: Record<string, unknown>) => {
            try {
              if (result?.error) {
                console.error("Error fetching similarity runs:", result.error);
                reject(new Error(String(result.error)));
                return;
              }

              const response = result?.result as
                | { runs?: SimilarityRun[] }
                | undefined;
              if (response?.runs) {
                setRuns([...response.runs].sort(sortFn));
              }
              setLoaded(true);
              resolve();
            } catch (e) {
              console.error("Error processing runs callback:", e);
              reject(e instanceof Error ? e : new Error(String(e)));
            }
          },
        }
      ).catch((error: unknown) => {
        console.error("Operator execution failed for fetchRuns:", error);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }, [fetchRuns, setRuns]);

  useEffect(() => {
    if (
      lastPanelId.current !== panelId ||
      lastDatasetName.current !== datasetName
    ) {
      lastPanelId.current = panelId;
      lastDatasetName.current = datasetName;
      initialized.current = true;
      refreshRuns();
      return;
    }

    if (!initialized.current) {
      initialized.current = true;
      refreshRuns();
    }
  }, [refreshRuns, panelId, datasetName]);

  const updateRun = useCallback(
    (run: SimilarityRun) => {
      setRuns((prev) => {
        const newRuns = [...prev];
        const idx = newRuns.findIndex((r) => r.run_id === run.run_id);
        if (idx >= 0) {
          newRuns.splice(idx, 1, run);
        } else {
          newRuns.push(run);
        }
        newRuns.sort(sortFn);
        return newRuns;
      });
    },
    [setRuns]
  );

  const removeRun = useCallback(
    (runId: string) => {
      setRuns((prev) => prev.filter((r) => r.run_id !== runId));
    },
    [setRuns]
  );

  return { runs, loaded, refreshRuns, updateRun, removeRun };
};
