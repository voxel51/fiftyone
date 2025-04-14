import { useNotification } from "@fiftyone/hooks";
import { ExternalLinkIcon, SearchIcon } from "@fiftyone/teams-components";
import { CONSTANT_VARIABLES, runsLogQuery } from "@fiftyone/teams-state";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect } from "react";
import { PreloadedQuery, useQueryLoader } from "react-relay";
import { OperationType } from "relay-runtime";
import { getLogStatus, LOG_STATUS } from "../utils/getLogStatus";
import LogPreview from "./logs/LogPreview";
import { useTheme } from "@mui/material";

type DefaultLog = {
  title?: string; // defaulted to logs not available
  message?: string; // right underneath the logs not available message
  button?: {
    message: string; // button underneath the message
    url: string;
    icon: "externalLink" | "download";
  };
};

export const DefaultLog = (props: DefaultLog) => {
  const theme = useTheme();
  const [_, sendNotification] = useNotification();
  const handleButtonClick = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownload = (url: string) => {
    const link = document.createElement("a");
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    sendNotification({
      msg: "Download started successfully",
      variant: "success",
    });
  };

  return (
    <Box
      sx={{
        display: "grid",
        placeItems: "center",
        minHeight: "30vh",
      }}
    >
      <Stack
        sx={{
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          display: "flex",
          gap: "24px",
        }}
      >
        <SearchIcon
          viewBox="0 0 50 50"
          fill="#FFC59B"
          sx={{ width: 50, height: 50 }}
        />
        <Typography variant="h6" color="secondary">
          {props?.title ?? "Logs not available"}
        </Typography>
        {props?.message && (
          <Typography variant="title" color="secondary">
            {props.message}
          </Typography>
        )}
        {props?.button && (
          <Button
            variant={
              props?.button?.icon === "download" ? "contained " : "outlined"
            }
            sx={{
              backgroundColor:
                props?.button?.icon === "download"
                  ? theme.palette.voxel["500"]
                  : "",
            }}
            endIcon={
              props.button.icon === "download" ? (
                <CloudDownloadIcon />
              ) : (
                <ExternalLinkIcon viewBox="0 0 17 16" />
              )
            }
            onClick={() =>
              props?.button?.icon === "download"
                ? handleDownload(props.button.url)
                : handleButtonClick(props.button.url)
            }
          >
            {props.button.message}
          </Button>
        )}
      </Stack>
    </Box>
  );
};

type LogStatus = keyof typeof LOG_STATUS;

export default function Logs(props) {
  const runData = props.runData;
  const logStatus = getLogStatus(runData) as LogStatus;
  const [logQueryRef, loadLogs] = useQueryLoader(runsLogQuery);

  useEffect(() => {
    loadLogs({ run: runData.id }, { fetchPolicy: "store-and-network" });
  }, [runData.id]);

  if (!logQueryRef) {
    return <></>;
  }

  return (
    <LogsContent
      logQueryRef={logQueryRef}
      logStatus={logStatus}
      runData={runData}
    />
  );
}

type LogsContent = {
  logQueryRef: PreloadedQuery<OperationType, Record<string, unknown>>;
  logStatus: LogStatus;
  runData: any;
};

function LogsContent({ logQueryRef, logStatus, runData }: LogsContent) {
  switch (logStatus) {
    case LOG_STATUS.PENDING:
      return (
        <DefaultLog message="Logs not available yet. Please check again after run has completed" />
      );
    case LOG_STATUS.URL_LINK:
      return (
        <DefaultLog
          button={{
            url: runData.runLink,
            message: "Open run link",
            icon: "externalLink",
          }}
        />
      );
    case LOG_STATUS.UNSET:
      return (
        <DefaultLog
          button={{
            icon: "externalLink",
            url: CONSTANT_VARIABLES.RUNS_LOG_DOCUMENTATION,
            message: "Configure logs",
          }}
        />
      );
    case LOG_STATUS.UPLOAD_ERROR:
      return (
        <DefaultLog message={runData.logUploadError ?? runData.result?.error} />
      );
    case LOG_STATUS.UPLOAD_SUCCESS:
      return <LogPreview queryRef={logQueryRef} />;
    case LOG_STATUS.UPLOAD_SUCCESS_LARGE_FILE:
      return (
        <DefaultLog
          message="Log size too large."
          button={{
            url: runData.logUrl ?? runData.logPath,
            message: "Download logs",
            icon: "download",
          }}
        />
      );
  }
  return <DefaultLog />;
}
