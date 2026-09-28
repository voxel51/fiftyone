import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import useRefresh from "../hooks/useRefresh";
import {
  selectionJobRequest,
  startSelectionJob,
  type SavedSubset,
  type SelectionJob,
  type SubsetAddResult,
} from "./client";
import { useInvalidateSelectionScope } from "./hooks";
import { subsetJobsAtom, type SubsetJobRecord } from "./model/jobs";

/** Whether server work still needs progress polling. */
export function selectionJobActive(job: SelectionJob) {
  return job.state === "requested" || job.state === "running";
}

function connectionFailure(
  record: SubsetJobRecord,
  cause: unknown,
): SubsetJobRecord {
  const unavailable =
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    [400, 401, 403, 404].includes(Number(cause.code));
  return unavailable
    ? {
        ...record,
        unavailable: true,
        connectionError: undefined,
        job: {
          ...record.job,
          state: "failed",
          error:
            "This operation is no longer available. Reopen the action to capture again.",
        },
      }
    : { ...record, connectionError: String(cause) };
}

/** Dataset-owned operation handles survive panel closure and page reloads. */
export function useSubsetJobs(datasetId: string) {
  const [jobs, setJobs] = useAtom(subsetJobsAtom(datasetId));
  const replace = useCallback(
    (id: string, record: SubsetJobRecord) => {
      setJobs((current) =>
        current.map((item) => {
          if (item.job.id !== id) return item;
          if (
            record.job.id === id &&
            !item.unavailable &&
            ((!selectionJobActive(item.job) &&
              selectionJobActive(record.job)) ||
              (item.job.state === "running" &&
                record.job.state === "requested"))
          )
            return item;
          return record;
        }),
      );
    },
    [setJobs],
  );
  const start = useCallback(
    async (subset: SavedSubset, request: unknown) => {
      const id = crypto.randomUUID();
      const record: SubsetJobRecord = {
        trackingId: id,
        subsetId: subset.id,
        subsetName: subset.name,
        subsetView: subset.view,
        preferredGroupSlice: subset.preferredGroupSlice,
        job: {
          id,
          kind: "add",
          state: "requested",
          progress: null,
          result: null,
          error: null,
          cancelRequested: false,
        },
      };
      setJobs((current) => [...current, record]);
      try {
        const job = await startSelectionJob<SubsetAddResult>(
          datasetId,
          "add",
          request,
          id,
        );
        replace(id, { ...record, job });
        return id;
      } catch (cause) {
        // The response may have been lost after the server accepted the request.
        // Keep its ID so the tray can reconnect without starting another write.
        replace(id, connectionFailure(record, cause));
        return id;
      }
    },
    [datasetId, replace, setJobs],
  );
  const act = useCallback(
    async (id: string, action: "cancel" | "retry") => {
      const record = jobs.find((item) => item.job.id === id);
      if (!record) return undefined;
      const job = await selectionJobRequest<SubsetAddResult>(
        datasetId,
        `/${id}`,
        { action },
      );
      replace(id, { ...record, job, connectionError: undefined });
      return job.id;
    },
    [datasetId, jobs, replace],
  );
  const dismiss = useCallback(
    (id: string) => {
      setJobs((current) =>
        current.filter(
          (item) => item.job.id !== id || selectionJobActive(item.job),
        ),
      );
    },
    [setJobs],
  );
  return { jobs, start, act, dismiss };
}

/** Mounted once by the tray, independent of any open action panel. */
export function useTrackSubsetJobs(datasetId: string) {
  const [jobs, setJobs] = useAtom(subsetJobsAtom(datasetId));
  const invalidate = useInvalidateSelectionScope(datasetId);
  const refresh = useRefresh();
  const ids = jobs
    .filter((record) => selectionJobActive(record.job))
    .map((record) => record.job.id)
    .join(",");
  // Poll only while work is pending. The server keeps working after unmount;
  // persisted handles reconnect when this dataset's tray is mounted again.
  useEffect(() => {
    if (!datasetId || !ids) return undefined;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await Promise.all(
        ids.split(",").map(async (id) => {
          try {
            const job = await selectionJobRequest<SubsetAddResult>(
              datasetId,
              `/${id}`,
            );
            if (!active) return;
            setJobs((current) =>
              current.map((item) =>
                item.job.id === id
                  ? { ...item, job, connectionError: undefined }
                  : item,
              ),
            );
            if (!selectionJobActive(job)) {
              invalidate();
              if (job.state === "completed") refresh();
            }
          } catch (cause) {
            if (active)
              setJobs((current) =>
                current.map((item) =>
                  item.job.id === id ? connectionFailure(item, cause) : item,
                ),
              );
          }
        }),
      );
      if (active) timer = setTimeout(() => void poll(), 2000);
    };
    timer = setTimeout(() => void poll(), 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [datasetId, ids, invalidate, refresh, setJobs]);
}
