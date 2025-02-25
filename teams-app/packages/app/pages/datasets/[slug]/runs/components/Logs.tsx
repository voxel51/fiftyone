import { ExternalLinkIcon, SearchIcon } from "@fiftyone/teams-components";
import { CONSTANT_VARIABLES } from "@fiftyone/teams-state";
import { Box, Button, Stack, Typography } from "@mui/material";
import { getLogStatus, LOG_STATUS } from "../utils/getLogStatus";
import LogPreview from "./logs/LogPreview";

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
          Logs are not available
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
          Logs are not available
        </Typography>
        <Stack spacing={1} direction="row">
          <Button
            variant="outlined"
            endIcon={<ExternalLinkIcon viewBox="0 0 17 16" />}
            onClick={() => handleButtonClick(CONSTANT_VARIABLES.HELM_DOC_URL)}
          >
            Helm documentation
          </Button>
          <Button
            variant="outlined"
            endIcon={<ExternalLinkIcon viewBox="0 0 17 16" />}
            onClick={() => handleButtonClick(CONSTANT_VARIABLES.DOCKER_DOC_URL)}
          >
            Docker documentation
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
          Logs are not available
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

export const DefaultLog = () => {
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
          Logs are not available
        </Typography>
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
    case LOG_STATUS.UPLOAD_SUCCESS:
      return <LogPreview {...props} />;
    case LOG_STATUS.UPLOAD_SUCCESS_LARGE_FILE:
      return <LogPreview isLargeFile={true} {...props} />;
  }
  return <DefaultLog />;
}
