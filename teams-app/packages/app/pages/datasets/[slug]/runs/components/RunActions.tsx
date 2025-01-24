import {
  useCurrentDatasetPermission,
  useCurrentUser,
  useMutation,
} from "@fiftyone/hooks";
import { ExternalLinkIcon, OverflowMenu } from "@fiftyone/teams-components";
import { OverflowMenuItemProps } from "@fiftyone/teams-components/src/OverflowMenu";
import {
  CAN_MANAGE_ANY_RUN,
  runsDeleteRunMutation,
  runsItemQuery$dataT,
  runsMarkRunFailedMutation,
  runsReRunMutation,
} from "@fiftyone/teams-state";
import { OPERATOR_RUN_STATES } from "@fiftyone/teams-state/src/constants";
import { DeleteOutline, DownloadOutlined } from "@mui/icons-material";
import ReplayIcon from "@mui/icons-material/Replay";
import SettingsSystemDaydreamOutlinedIcon from "@mui/icons-material/SettingsSystemDaydreamOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import { Typography } from "@mui/material";
import { noop } from "lodash";
import isUrl from "../utils/isUrl";

export default function RunActions(props: RunActionsPropsType) {
  const {
    id,
    refresh = noop,
    runBy,
    runState,
    runLink,
    signedUrl,
    result,
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
  const canViewInOrchestrator =
    runLink && isUrl(runLink) && !hideViewInOrchestrator;

  const isExpired = result.includes("expired");

  // TO UPDATE:
  const hasLogSetup = true;
  // TODO: update the url and move it to Constants.ts
  const logDocUrl = "https://docs.voxel51.com/teams/teams_plugins.html";

  // when operation expired, we won't be able to download the logs from the url
  const hasLogUrl = Boolean(signedUrl) && !isExpired;

  const handleButtonClick = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const items: OverflowMenuItemProps[] = [
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
  ];
  // view in orchestrator button
  if (canViewInOrchestrator) {
    items.push({
      primaryText: "View in orchestrator",
      IconComponent: <SettingsSystemDaydreamOutlinedIcon color="secondary" />,
      onClick() {
        window.open(runLink); // todo: add support for link
      },
    });
  }

  // download logs
  if (hasLogSetup)
    items.push({
      primaryText: <Typography>Download logs</Typography>,
      IconComponent: <DownloadOutlined />,
      onClick() {
        if (hasLogUrl) {
          if (runLink?.startsWith("http")) {
            // when signedUrl is also a url link
            window.open(signedUrl, "_blank", "noopener,noreferrer");
          } else if (signedUrl) {
            // Download the content using the signedUrl
            const link = document.createElement("a");
            link.href = signedUrl;
            link.download = "logs.txt";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        }
      },
      disabled: !hasLogUrl,
      title: !hasLogUrl ? "Log not available" : undefined,
    });

  // delete button
  items.push({
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
  });

  // config logs
  if (!hasLogSetup) {
    items.push({
      isDivider: true,
    });
    items.push({
      primaryText: <Typography color="secondary">Configure logs </Typography>,
      IconComponent: (
        <ExternalLinkIcon color="secondary" width={17} height={17} />
      ),
      iconPosition: "right",
      onClick() {
        handleButtonClick(logDocUrl);
      },
    });
  }

  return (
    <OverflowMenu
      items={items}
      containerProps={{ textAlign: "right" }}
      constrainEvent
    />
  );
}

type RunActionsPropsType = runsItemQuery$dataT["delegatedOperation"] & {
  refresh?: () => void;
  hideViewInOrchestrator?: boolean;
};
