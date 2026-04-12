import { atom, useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import { useOperatorExecutor } from "@fiftyone/operators";
import { useExecutionStoreSubscribe } from "@fiftyone/core/src/subscription/useExecutionStoreSubscribe";
import { usePanelId } from "@fiftyone/spaces";
import {
  datasetId as datasetIdAtom,
  datasetName as datasetNameAtom,
} from "@fiftyone/state";
import { SSE_OPERATOR_URI } from "../constants";
import { SimilarityRun } from "../types";

const runsAtom = atom<SimilarityRun[]>([]);
const loadedAtom = atom(false);

type UseRunsResult = {
  runs: SimilarityRun[];
  loaded: boolean;
  refreshRuns: () => Promise<void>;
  updateRun: (run: SimilarityRun) => void;
  removeRun: (runId: string) => void;
  removeRuns: (runIds: string[]) => void;
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
  const [loaded, setLoaded] = useAtom(loadedAtom);
  const initialized = useRef(false);
  const lastPanelId = useRef<string | undefined>();
  const lastDatasetName = useRef<string | null | undefined>();
  const panelId = usePanelId();
  const datasetName = useRecoilValue(datasetNameAtom);
  const datasetId = useRecoilValue(datasetIdAtom);
  const { execute: fetchRuns } = useOperatorExecutor(
    "@voxel51/panels/list_similarity_runs"
  );
  const fetchingRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const MAX_RETRY = 5;

  const refreshRuns = useCallback(() => {
    // If a fetch is already in flight, queue a follow-up refresh
    // and return the in-flight promise so callers can still await.
    if (fetchingRef.current) {
      pendingRefreshRef.current = true;
      return inFlightRef.current ?? Promise.resolve();
    }
    fetchingRef.current = true;

    const drainPending = (isError: boolean) => {
      if (isError) {
        consecutiveErrorsRef.current += 1;
      } else {
        consecutiveErrorsRef.current = 0;
      }

      if (
        pendingRefreshRef.current &&
        consecutiveErrorsRef.current < MAX_RETRY
      ) {
        pendingRefreshRef.current = false;
        refreshRuns();
      } else {
        pendingRefreshRef.current = false;
      }
    };

    const promise = new Promise<void>((resolve, reject) => {
      fetchRuns(
        {},
        {
          callback: (result?: Record<string, unknown>) => {
            fetchingRef.current = false;
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
            } finally {
              drainPending(false);
            }
          },
        }
      ).catch((error: unknown) => {
        fetchingRef.current = false;
        console.error("Operator execution failed for fetchRuns:", error);
        drainPending(true);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });

    inFlightRef.current = promise.finally(() => {
      inFlightRef.current = null;
    });

    return inFlightRef.current;
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

  // Subscribe to execution store changes via SSE for auto-refresh
  const onStoreChange = useCallback(() => {
    refreshRuns();
  }, [refreshRuns]);

  useExecutionStoreSubscribe({
    operatorUri: SSE_OPERATOR_URI,
    callback: onStoreChange,
    datasetId: datasetId ?? undefined,
  });

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

  const removeRuns = useCallback(
    (runIds: string[]) => {
      const ids = new Set(runIds);
      setRuns((prev) => prev.filter((r) => !ids.has(r.run_id)));
    },
    [setRuns]
  );

  return { runs, loaded, refreshRuns, updateRun, removeRun, removeRuns };
};
