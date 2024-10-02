import { runsPageQuery$dataT } from "@fiftyone/teams-state";
import { OPERATOR_RUN_STATES } from "@fiftyone/teams-state/src/constants";
const { QUEUED, RUNNING, COMPLETED, FAILED } = OPERATOR_RUN_STATES;

export default function getTimestamp(
  run: runsPageQuery$dataT["delegatedOperationsPage"]["nodes"][number]
) {
  const { runState, queuedAt, startedAt, completedAt, failedAt } = run;

  switch (runState) {
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
