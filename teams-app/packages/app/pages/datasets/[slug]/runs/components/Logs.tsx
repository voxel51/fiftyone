import { ExternalLinkIcon, SearchIcon } from "@fiftyone/teams-components";
import { CONSTANT_VARIABLES } from "@fiftyone/teams-state";
import { Box, Button, Stack, Typography } from "@mui/material";
import { getLogStatus, LOG_STATUS } from "../utils/getLogStatus";
import LogPreview from "./logs/LogPreview";

const UNAVAILABLE_LOGS =
  "Run logs are not yet available, please check again after completion.";

const URLLog = (props) => {
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
        <Stack spacing={1} direction="row">
          <Button
            variant="outlined"
            endIcon={<ExternalLinkIcon viewBox="0 0 17 16" />}
            onClick={() => handleButtonClick(props.runLink)}
          >
            Open run link
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};
const UnsetLog = () => {
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
        <Stack spacing={1} direction="row">
          <Button
            variant="outlined"
            endIcon={<ExternalLinkIcon viewBox="0 0 17 16" />}
            onClick={() => handleButtonClick(CONSTANT_VARIABLES.HELM_DOC_URL)}
          >
            Configure logs
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};
const PendingLog = () => {
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
        <Stack spacing={1} direction="row">
          <Typography variant="body" color="secondary">
            The operation has not completed yet, try again in sometime
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
};

export const DefaultLog = (props) => {
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
    </Box>
  );
};

type LogStatus = keyof typeof LOG_STATUS;

export default function Logs(props) {
  let logStatus = getLogStatus(props.runData) as LogStatus;

  switch (logStatus) {
    case LOG_STATUS.PENDING:
      return <PendingLog />;
    case LOG_STATUS.URL_LINK:
      return <URLLog runLink={props.runData.runLink} />;
    case LOG_STATUS.UNSET:
      return <UnsetLog />;
    case LOG_STATUS.UPLOAD_ERROR:
      return <DefaultLog message={props.runData.logUploadError} />;
    case LOG_STATUS.UPLOAD_SUCCESS:
      return <LogPreview {...props} />;
    case LOG_STATUS.UPLOAD_SUCCESS_LARGE_FILE:
      return (
        <LogPreview
          isLargeFile={true}
          logConnection={props.logConnection}
          {...props}
        />
      );
  }
  return <DefaultLog />;
}
