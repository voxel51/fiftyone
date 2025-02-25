import { ExternalLinkIcon, SearchIcon } from "@fiftyone/teams-components";
import { CONSTANT_VARIABLES } from "@fiftyone/teams-state";
import { Box, Button, Stack, Typography } from "@mui/material";
import { getLogStatus, LOG_STATUS } from "../utils/getLogStatus";
import LogPreview from "./logs/LogPreview";

// Type definitions
type ButtonProps = {
  label: string;
  url: string;
};

type LogMessageProps = {
  message?: string;
  buttons?: ButtonProps[];
};

// Generic log display component
const LogMessage: React.FC<LogMessageProps> = ({ message, buttons = [] }) => (
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
      {message && (
        <Typography variant="body2" color="secondary">
          {message}
        </Typography>
      )}
      <Stack spacing={1} direction="row">
        {buttons.map(({ label, url }, index) => (
          <Button
            key={index}
            variant="outlined"
            endIcon={<ExternalLinkIcon viewBox="0 0 17 16" />}
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          >
            {label}
          </Button>
        ))}
      </Stack>
    </Stack>
  </Box>
);

type LogStatus = keyof typeof LOG_STATUS;

export default function Logs(props: { runData: { runLink?: string } }) {
  const logStatus = getLogStatus(props.runData) as LogStatus;

  // Define different log states
  const logConfig: Record<LogStatus, LogMessageProps | null> = {
    [LOG_STATUS.PENDING]: {
      message: "The operation has not completed, try again in some time",
    },
    [LOG_STATUS.URL_LINK]: {
      buttons: [{ label: "Open run link", url: props.runData.runLink || "" }],
    },
    [LOG_STATUS.UNSET]: {
      buttons: [
        { label: "Helm documentation", url: CONSTANT_VARIABLES.HELM_DOC_URL },
        {
          label: "Docker documentation",
          url: CONSTANT_VARIABLES.DOCKER_DOC_URL,
        },
      ],
    },
    [LOG_STATUS.UPLOAD_SUCCESS]: null,
    [LOG_STATUS.UPLOAD_SUCCESS_LARGE_FILE]: null,
    [LOG_STATUS.UPLOAD_ERROR]: { message: "Error in publishing the logs" },
  };

  // Handle special cases (log previews)
  if (logStatus === LOG_STATUS.UPLOAD_SUCCESS) return <LogPreview {...props} />;
  if (logStatus === LOG_STATUS.UPLOAD_SUCCESS_LARGE_FILE)
    return <LogPreview isLargeFile={true} {...props} />;

  // Default log display
  return (
    <LogMessage {...(logConfig[logStatus] || logConfig[LOG_STATUS.UNSET])} />
  );
}
