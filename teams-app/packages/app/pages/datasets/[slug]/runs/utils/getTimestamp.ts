import { runsPageQuery$dataT } from "@fiftyone/teams-state";
import { OPERATOR_RUN_STATES } from "@fiftyone/teams-state/src/constants";
const { SCHEDULED, QUEUED, RUNNING, COMPLETED, FAILED } = OPERATOR_RUN_STATES;

export default function getTimestamp(
  run: runsPageQuery$dataT["delegatedOperationsPage"]["nodes"][number]
) {
  const { runState, scheduledAt, queuedAt, startedAt, completedAt, failedAt } =
    run;

  switch (runState) {
    case SCHEDULED:
      return scheduledAt;
    case QUEUED:
      return queuedAt;
    case RUNNING:
      return startedAt;
    case COMPLETED:
      return completedAt;
    case FAILED:
      return failedAt;
    default:
      return queuedAt;
  }
}
