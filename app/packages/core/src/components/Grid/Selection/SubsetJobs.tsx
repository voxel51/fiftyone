import {
  selectionJobActive,
  useSubsetJobs,
  useTrackSubsetJobs,
} from "@fiftyone/state/src/selection";
import {
  Button,
  GridViewIcon,
  LoadingDots,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useState } from "react";
import { useSelectionSubsetDisabledReason } from "@fiftyone/state";
import ActionSurface from "./ActionSurface";
import { defaultSubsetScope, useOpenSubset } from "./useSubsetScope";
import { Notice } from "./Notice";
import { plural } from "./format";
import styles from "./SelectionTray.module.css";

/** A panel watches persisted work; closing it does not stop the server. */
export function SubsetJobStatus({
  datasetId,
  jobId,
  close,
}: {
  datasetId: string;
  jobId: string;
  close: () => void;
}) {
  const { jobs, act, dismiss } = useSubsetJobs(datasetId);
  const permission = useSelectionSubsetDisabledReason();
  const record = jobs.find(
    (item) => item.job.id === jobId || item.trackingId === jobId,
  );
  const [replacementId, setReplacementId] = useState<string>();
  const [stopping, setStopping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const openSubset = useOpenSubset(datasetId);
  const current = jobs.find((item) => item.job.id === replacementId) ?? record;
  if (!current) return null;
  const { job, subsetName, subsetId, connectionError } = current;
  const running = selectionJobActive(job);
  const progress = job.progress;
  const done = progress?.done.toLocaleString() ?? "0";
  const total = progress?.total?.toLocaleString();
  const result = job.result;
  const title =
    job.state === "completed"
      ? `${plural(result?.added ?? 0, "member")} added to ${subsetName}`
      : job.state === "failed"
        ? `Couldn't finish adding to ${subsetName}`
        : job.state === "canceled"
          ? `Stopped adding to ${subsetName}`
          : job.cancelRequested
            ? `Stopping after the current batch…`
            : progress?.phase === "applying"
              ? `Adding to ${subsetName}`
              : progress?.phase === "preparing"
                ? `Preparing members for ${subsetName}`
                : `Waiting to add to ${subsetName}`;
  const perform = async (action: "cancel" | "retry") => {
    setBusy(true);
    setError(undefined);
    try {
      const nextId = await act(job.id, action);
      if (nextId) setReplacementId(nextId);
      setStopping(false);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.sheetBody}>
      <Notice
        icon={GridViewIcon}
        tone={
          job.state === "failed"
            ? "error"
            : job.state === "completed"
              ? "success"
              : "info"
        }
        role="status"
        title={title}
      >
        {running && progress && (
          <LoadingDots
            variant={TextVariant.Sm}
            color={TextColor.Secondary}
            text={
              total
                ? `${done} of ${total} members`
                : `${done} members processed`
            }
          />
        )}
        {result &&
          result.duplicates > 0 &&
          `${plural(result.duplicates, "member")} ${result.duplicates === 1 ? "was" : "were"} already in the subset.`}
        {job.state === "failed" && job.error}
        {!current.unavailable &&
          (job.state === "failed" || job.state === "canceled") && (
            <p>
              Members already saved remain in the subset. Retry continues the
              captured operation.
            </p>
          )}
        {running && <p>You can keep working while this finishes.</p>}
      </Notice>
      {(connectionError || error) && (
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Destructive}
          role="alert"
        >
          {error ?? "Connection lost. Reconnecting to the same operation…"}
        </Text>
      )}
      {stopping && (
        <Notice
          icon={GridViewIcon}
          tone="warning"
          role="alert"
          title="Stop adding?"
        >
          Members already saved will stay in {subsetName}.
        </Notice>
      )}
      <div className={styles.sheetActions}>
        <Button
          size={Size.Sm}
          variant={Variant.Borderless}
          onClick={() => {
            if (!running) dismiss(job.id);
            close();
          }}
        >
          {running ? "Keep working" : "Done"}
        </Button>
        {running && !job.cancelRequested && (
          <Button
            size={Size.Sm}
            variant={Variant.Secondary}
            disabled={busy}
            onClick={() =>
              stopping ? void perform("cancel") : setStopping(true)
            }
          >
            Stop
          </Button>
        )}
        {stopping && (
          <Button
            size={Size.Sm}
            variant={Variant.Borderless}
            onClick={() => setStopping(false)}
          >
            Continue adding
          </Button>
        )}
        {!current.unavailable &&
          (job.state === "failed" || job.state === "canceled") && (
            <Button
              size={Size.Sm}
              disabled={busy || Boolean(permission)}
              onClick={() => !permission && void perform("retry")}
            >
              Retry
            </Button>
          )}
        {result && (
          <Button
            size={Size.Sm}
            variant={Variant.Secondary}
            onClick={() => {
              openSubset(
                subsetId,
                defaultSubsetScope(result.counts),
                current.subsetView,
                current.preferredGroupSlice,
              );
              dismiss(job.id);
              close();
            }}
          >
            Open subset
          </Button>
        )}
      </div>
    </div>
  );
}

/** Always mounted with the tray, so operations remain reachable between actions. */
export default function SubsetJobs({ datasetId }: { datasetId: string }) {
  useTrackSubsetJobs(datasetId);
  const { jobs } = useSubsetJobs(datasetId);
  const [open, setOpen] = useState<string>();
  if (!jobs.length) return null;
  return (
    <div className={styles.sheetActions}>
      {jobs.map(({ job, subsetName, trackingId }) => (
        <ActionSurface
          key={trackingId}
          open={open === trackingId}
          onClose={() => setOpen(undefined)}
          title={`Save to ${subsetName}`}
          surface="toolbar"
          trigger={
            <Button
              size={Size.Sm}
              variant={Variant.Borderless}
              onClick={() => setOpen(trackingId)}
            >
              {selectionJobActive(job)
                ? "Saving"
                : job.state === "completed"
                  ? "Saved"
                  : "Save needs attention"}
              : {subsetName}
            </Button>
          }
        >
          <SubsetJobStatus
            datasetId={datasetId}
            jobId={trackingId}
            close={() => setOpen(undefined)}
          />
        </ActionSurface>
      ))}
    </div>
  );
}
