import { PendingRunsNotice } from "@fiftyone/components";
import type { PendingRun } from "@fiftyone/operators";

export default function PendingIndexNotice({
  runs,
  onView,
}: {
  runs: PendingRun[];
  onView: () => void;
}) {
  const active = runs.filter((run) => run.run_state !== "failed");
  if (active.length === 0) return null;

  const label =
    active.length === 1
      ? "There is 1 similarity index in progress"
      : `There are ${active.length} similarity indexes in progress`;

  return (
    <div style={{ marginBottom: "1rem" }}>
      <PendingRunsNotice
        label={label}
        viewLabel="View indexes"
        onView={onView}
      />
    </div>
  );
}
