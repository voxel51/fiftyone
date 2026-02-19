import { useCallback, useEffect, useRef } from "react";
import { useAtom } from "jotai";
import { useRecoilValue } from "recoil";
import { useOperatorExecutor } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { datasetName as datasetNameAtom } from "@fiftyone/state";
import atoms from "../state";
import { SimilarityRun } from "../types";

/**
 * Hook that fetches similarity search runs from the backend.
 */
export const useFetchRuns = (): {
  refreshRuns: () => Promise<void>;
  sortFn: (a: SimilarityRun, b: SimilarityRun) => number;
} => {
  const initialized = useRef(false);
  const lastPanelId = useRef<string | undefined>();
  const lastDatasetName = useRef<string | null | undefined>();
  const panelId = usePanelId();
  const datasetName = useRecoilValue(datasetNameAtom);
  const [runs, setRuns] = useAtom(atoms.runs);
  const { execute: fetchRuns } = useOperatorExecutor(
    "@voxel51/panels/list_similarity_runs"
  );

  const sortFn = useCallback(
    (a: SimilarityRun, b: SimilarityRun) =>
      (b.creation_time ?? "").localeCompare(a.creation_time ?? ""),
    []
  );

  const refreshRuns = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      fetchRuns(
        {},
        {
          callback: (result?: any) => {
            try {
              if (result?.error) {
                console.error("Error fetching similarity runs:", result.error);
                reject(new Error(result.error));
                return;
              }

              const response = result?.result;
              if (response?.runs) {
                setRuns([...response.runs].sort(sortFn));
              }
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
  }, [fetchRuns, setRuns, sortFn]);

  useEffect(() => {
    if (
      lastPanelId.current !== panelId ||
      lastDatasetName.current !== datasetName
    ) {
      lastPanelId.current = panelId;
      lastDatasetName.current = datasetName;
      refreshRuns();
      initialized.current = true;
      return;
    }

    if (!initialized.current) {
      if (runs && runs.length > 0) {
        initialized.current = true;
      } else {
        refreshRuns();
        initialized.current = true;
      }
    }
  }, [refreshRuns, runs, panelId, datasetName]);

  return { refreshRuns, sortFn };
};
