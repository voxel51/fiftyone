import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOperatorExecutor } from "./state";

const LIST_PENDING_RUNS_URI = "@voxel51/operators/list_pending_runs";
const POLL_MS = 5000;
const FAILED = "failed";

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
  { operators, stageOperators = [], onViewRun }: PendingRunsConfig,
  refreshKey?: unknown,
) {
  const { execute } = useOperatorExecutor(LIST_PENDING_RUNS_URI);
  const executeRef = useRef(execute);
  executeRef.current = execute;
  const [runs, setRuns] = useState<PendingRun[]>([]);
  const datasetName = fos.useCurrentDatasetName();

  const refresh = useCallback(
    () =>
      executeRef.current(
        { operators, stage_operators: stageOperators },
        {
          callback: (result) => {
            if (!result?.error) setRuns((result?.result as PendingRun[]) ?? []);
          },
        },
      ),
    [operators, stageOperators],
  );

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

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

  return { runs: withView, refresh };
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  queued: "Queued",
  running: "Running",
  processing: "Running",
  failed: "Failed",
};

export function usePendingRunScreen(runs: PendingRunWithView[]) {
  const [openId, setOpenId] = useState<string | null>(null);
  const run = runs.find((candidate) => candidate.id === openId);

  return {
    open: setOpenId,
    screen: run && {
      title: run.brain_key ?? run.label ?? run.operator,
      status: (run.run_state === "processing" ? "running" : run.run_state) as
        | "scheduled"
        | "queued"
        | "running"
        | "failed",
      runTitle: STATUS_LABELS[run.run_state] ?? run.run_state,
      onBack: () => setOpenId(null),
      onViewStatus: run.onView,
    },
  };
}
