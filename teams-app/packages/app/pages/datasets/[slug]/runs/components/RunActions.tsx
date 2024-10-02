import {
  useCurrentDatasetPermission,
  useCurrentUser,
  useMutation,
} from "@fiftyone/hooks";
import { OverflowMenu } from "@fiftyone/teams-components";
import {
  CAN_MANAGE_ANY_RUN,
  runsDeleteRunMutation,
  runsItemQuery$dataT,
  runsMarkRunFailedMutation,
  runsReRunMutation,
} from "@fiftyone/teams-state";
import { OPERATOR_RUN_STATES } from "@fiftyone/teams-state/src/constants";
import { DeleteOutline } from "@mui/icons-material";
import ReplayIcon from "@mui/icons-material/Replay";
import SettingsSystemDaydreamOutlinedIcon from "@mui/icons-material/SettingsSystemDaydreamOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import { Typography } from "@mui/material";
import { noop } from "lodash";

export default function RunActions(props: RunActionsPropsType) {
  const {
    id,
    refresh = noop,
    runBy,
    runState,
    runLink,
    hideViewInOrchestrator,
  } = props;
  const [reRun] = useMutation(runsReRunMutation);
  const [markFailed] = useMutation(runsMarkRunFailedMutation);
  const [deleteRun] = useMutation(runsDeleteRunMutation);

  const [user] = useCurrentUser();
  const canManageAnyRun = useCurrentDatasetPermission([CAN_MANAGE_ANY_RUN]);
  const canManageRun = canManageAnyRun || user?.id === runBy?.id;

  if (!canManageRun) return null;

  const isRunning = runState === OPERATOR_RUN_STATES.RUNNING;

  return (
    <OverflowMenu
      items={[
        {
          primaryText: "Re-run",
          IconComponent: <ReplayIcon color="secondary" />,
          onClick() {
            reRun({
              variables: { operationId: id },
              successMessage: "Successfully triggered a re-run",
              onSuccess: refresh,
            });
          },
        },
        {
          primaryText: "Mark as failed",
          IconComponent: <StopCircleOutlinedIcon color="secondary" />,
          onClick() {
            markFailed({
              variables: { operationId: id },
              successMessage: "Successfully marked the run as failed",
            });
          },
          disabled: !isRunning,
          title: !isRunning
            ? "Cannot mark non-running operation as failed"
            : undefined,
        },
        ...(runLink && !hideViewInOrchestrator
          ? [
              {
                primaryText: "View in orchestrator",
                IconComponent: (
                  <SettingsSystemDaydreamOutlinedIcon color="secondary" />
                ),
                onClick() {
                  window.open(runLink); // todo: add support for link
                },
              },
            ]
          : []),
        {
          primaryText: <Typography color="error">Delete</Typography>,
          IconComponent: <DeleteOutline color="error" />,
          onClick() {
            deleteRun({
              variables: { operationId: id },
              successMessage: "Successfully deleted an operation",
              onSuccess: refresh,
            });
          },
          disabled: isRunning,
          title: isRunning ? "Cannot delete running operation" : undefined,
        },
      ]}
      containerProps={{ textAlign: "right" }}
      constrainEvent
    />
  );
}

type RunActionsPropsType = runsItemQuery$dataT["delegatedOperation"] & {
  refresh?: () => void;
  hideViewInOrchestrator?: boolean;
};
