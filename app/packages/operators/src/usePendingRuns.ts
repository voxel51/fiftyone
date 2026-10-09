import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import {
  OperatorLoadResult,
  operatorsInitializedAtom,
  useOperatorExecutor,
} from "./state";

const LIST_PENDING_RUNS_URI = "@voxel51/operators/list_pending_runs";
const POLL_MS = 5000;
const FAILED = "failed";
const NO_STAGE_OPERATORS: string[] = [];

export type PendingRun = {
  id: string;
  operator: string;
  run_state: string;
  label: string | null;
  brain_key: string | null;
};

export type PendingRunWithView = PendingRun & {
  /** Views the run; absent when `onViewRun` is not configured */
  onView?: () => void;
};

export type PendingRunsConfig = {
  /** Delegated operator URIs whose runs count */
  operators: string[];
  /** Pipeline stage URIs that make a pipeline parent count */
  stageOperators?: string[];
  /** Views a run, e.g. opens its page; omit when runs cannot be viewed */
  onViewRun?: (run: PendingRun, context: { datasetName: string }) => void;
};

/**
 * Scheduled, queued, running and recently failed delegated runs of
 * `config` on the current dataset, newest first. Polls only while one is
 * active, and each run can be viewed through `config.onViewRun`;
 * `refreshKey` forces a fetch when it changes. `config.operators` and
 * `config.stageOperators` must be referentially stable.
 */
export default function usePendingRuns(
  {
    operators,
    stageOperators = NO_STAGE_OPERATORS,
    onViewRun,
  }: PendingRunsConfig,
  refreshKey?: unknown,
) {
  const operatorsInitialized = useRecoilValue(operatorsInitializedAtom);
  const { execute, loadResult } = useOperatorExecutor(LIST_PENDING_RUNS_URI);
  const available = loadResult === OperatorLoadResult.SUCCESS;
  const executeRef = useRef(execute);
  executeRef.current = execute;
  const [runs, setRuns] = useState<PendingRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const datasetName = fos.useCurrentDatasetName();

  const refresh = useCallback(
    () =>
      executeRef.current(
        { operators, stage_operators: stageOperators },
        {
          callback: (result) => {
            if (!result?.error) setRuns((result?.result as PendingRun[]) ?? []);
            setLoaded(true);
          },
        },
      ),
    [operators, stageOperators],
  );

  // Executing before the operator registry loads throws on the next render
  // and takes the panel down when it is restored at page load
  useEffect(() => {
    if (!operatorsInitialized) return;
    if (available) refresh();
    else setLoaded(true);
  }, [operatorsInitialized, available, refresh, refreshKey]);

  const active = runs.some((run) => run.run_state !== FAILED);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  const withView = useMemo<PendingRunWithView[]>(
    () =>
      onViewRun
        ? runs.map((run) => ({
            ...run,
            onView: () => onViewRun(run, { datasetName }),
          }))
        : runs,
    [runs, datasetName, onViewRun],
  );

  return { runs: withView, loaded, refresh };
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  queued: "Queued",
  running: "Running",
  processing: "Running",
  in_progress: "In progress",
  failed: "Failed",
};

export function usePendingRunScreen(
  runs: PendingRunWithView[],
  description?: string,
) {
  const [openId, setOpenId] = useState<string | null>(null);
  const run = runs.find((candidate) => candidate.id === openId);

  return {
    open: setOpenId,
    screen: run && {
      title: run.brain_key ?? run.label ?? run.operator,
      description,
      status: (run.run_state === "processing" ? "running" : run.run_state) as
        | "scheduled"
        | "queued"
        | "running"
        | "in_progress"
        | "failed",
      runTitle: STATUS_LABELS[run.run_state] ?? run.run_state,
      onBack: () => setOpenId(null),
      onViewStatus: run.onView,
    },
  };
}
