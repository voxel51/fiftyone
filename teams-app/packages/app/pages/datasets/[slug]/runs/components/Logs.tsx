import { ExternalLinkIcon, SearchIcon } from "@fiftyone/teams-components";
import { Box, Button, Stack, Typography } from "@mui/material";
import { CONSTANT_VARIABLES } from "@fiftyone/teams-state";

const EmptyLogs = () => {
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

export default function Logs() {
  const emptyLog = true;
  if (emptyLog) {
    return <EmptyLogs />;
  }

  return <Stack>normal logs</Stack>;
}
