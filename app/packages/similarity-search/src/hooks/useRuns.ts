import { atom, getDefaultStore, useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import { useOperatorExecutor } from "@fiftyone/operators";
import { useExecutionStoreSubscribe } from "@fiftyone/core/src/subscription/useExecutionStoreSubscribe";
import { usePanelId } from "@fiftyone/spaces";
import {
  datasetId as datasetIdAtom,
  datasetName as datasetNameAtom,
} from "@fiftyone/state";
import { LIST_RUNS_OPERATOR_URI, SSE_OPERATOR_URI } from "../constants";
import { SimilarityRun } from "../types";
import { filterStateAtom } from "./useFilteredRuns";

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
  const { execute: fetchRuns } = useOperatorExecutor(LIST_RUNS_OPERATOR_URI);

  // ── Coalescing refresh mechanism ───────────────────────────────
  // SSE events and user actions can trigger refreshRuns() at any
  // time, including while a fetch is already in flight.  Instead of
  // dropping those requests or firing concurrent fetches, we
  // coalesce them: when a refresh is requested during an in-flight
  // fetch, we set a "pending" flag.  Once the current fetch settles,
  // we automatically fire one more refresh to pick up whatever
  // changed.  A consecutive-error counter (max 5) prevents runaway
  // retries when the backend is persistently failing.
  const fetchingRef = useRef(false);
  const pendingRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const errorCountRef = useRef(0);
  const MAX_RETRY = 5;

  const refreshRuns = useCallback(() => {
    // If a fetch is already in flight, queue a follow-up refresh
    // and return the in-flight promise so callers can still await.
    if (fetchingRef.current) {
      pendingRef.current = true;
      return inFlightRef.current ?? Promise.resolve();
    }
    fetchingRef.current = true;

    // Owner filter is applied server-side. Read the latest value at
    // call time so SSE-driven refreshes always pick up the current
    // selection without needing to live in React state.
    const { ownerFilter } = getDefaultStore().get(filterStateAtom);

    const promise = new Promise<void>((resolve, reject) => {
      fetchRuns(
        { owner: ownerFilter },
        {
          callback: (result?: Record<string, unknown>) => {
            fetchingRef.current = false;

            if (result?.error) {
              console.error("Error fetching similarity runs:", result.error);
              reject(new Error(String(result.error)));
              return;
            }

            try {
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
        fetchingRef.current = false;
        console.error("Operator execution failed for fetchRuns:", error);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });

    // After each attempt settles, check whether a refresh was
    // requested while we were busy.  On success the error counter
    // resets; on failure it increments, and we stop retrying after
    // MAX_RETRY consecutive failures.
    //
    // We use a separate chain for coalescing so the original promise's
    // rejection propagates to callers (e.g. handleSubmitted's await).
    promise
      .then(() => {
        errorCountRef.current = 0;
      })
      .catch(() => {
        errorCountRef.current += 1;
      })
      .finally(() => {
        inFlightRef.current = null;
        if (pendingRef.current && errorCountRef.current < MAX_RETRY) {
          pendingRef.current = false;
          refreshRuns();
        } else {
          pendingRef.current = false;
        }
      });

    inFlightRef.current = promise;
    return promise;
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
