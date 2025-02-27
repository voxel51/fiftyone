import { ExternalLinkIcon, SearchIcon } from "@fiftyone/teams-components";
import { CONSTANT_VARIABLES, runsLogQuery } from "@fiftyone/teams-state";
import { Box, Button, Stack, Typography } from "@mui/material";
import { useEffect } from "react";
import { PreloadedQuery, useQueryLoader } from "react-relay";
import { getLogStatus, LOG_STATUS } from "../utils/getLogStatus";
import LogPreview from "./logs/LogPreview";
import { OperationType } from "relay-runtime";

type DefaultLog = {
  message?: string; // right underneath the logs not available message
  button?: {
    message: string; // what to display in the button
    url: string;
  };
};

export const DefaultLog = (props: DefaultLog) => {
  const handleButtonClick = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Box
      sx={{
        display: "grid",
        placeItems: "center",
        minHeight: "50vh",
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
          {UNAVAILABLE_LOGS}
        </Typography>
        {props?.message && (
          <Typography variant="title" color="secondary">
            {props.message}
          </Typography>
        )}
      </Stack>
      {props?.button && (
        <Stack spacing={1} direction="row">
          {props.button.url ? (
            <Button
              variant="outlined"
              endIcon={<ExternalLinkIcon viewBox="0 0 17 16" />}
              onClick={() => handleButtonClick(props.button.url)}
            >
              {props.button.message}
            </Button>
          ) : (
            <Typography variant="body" color="secondary">
              {props.button.message}
            </Typography>
          )}
        </Stack>
      )}
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
        <DefaultLog message="The operation has not completed yet. Please try again later." />
      );
    case LOG_STATUS.URL_LINK:
      return (
        <DefaultLog
          button={{ url: runData.runLink, message: "Open run link" }}
        />
      );
    case LOG_STATUS.UNSET:
      //TODO: replace the doc url here with the correct one when it's ready
      return (
        <DefaultLog
          button={{
            url: CONSTANT_VARIABLES.HELM_DOC_URL,
            message: "Configure logs",
          }}
        />
      );
    case LOG_STATUS.UPLOAD_ERROR:
      return <DefaultLog message={runData.logUploadError} />;
    case LOG_STATUS.UPLOAD_SUCCESS:
      return <LogPreview queryRef={logQueryRef} />;
    case LOG_STATUS.UPLOAD_SUCCESS_LARGE_FILE:
      return <UnsetLog isLargeFile={true} logPath={runData.logPath} />;
  }
  return <DefaultLog />;
}
