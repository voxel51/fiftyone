import { Box, Button, Link, Typography, Grid } from "@mui/material";
import { useTheme } from "@fiftyone/components";
import WorkspacesIcon from "@mui/icons-material/Workspaces";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ComputeVisualizationButton from "./ComputeVisualizationButton";
import { useMemo } from "react";
import { listLocalAndRemoteOperators } from "@fiftyone/operators/src/operators";

const useFirstExistingUri = (uris: string[]) => {
  const availableOperators = useMemo(() => listLocalAndRemoteOperators(), []);
  return useMemo(() => {
    const existingUri = uris.find((uri) =>
      availableOperators.allOperators.some((op) => op.uri === uri)
    );
    const exists = Boolean(existingUri);
    return { firstExistingUri: existingUri, exists };
  }, [availableOperators, uris]);
};

export default function EmptyEmbeddings() {
  const theme = useTheme();
  const secondaryBodyColor = theme.text.secondary;
  const { firstExistingUri: computeVisUri, exists: hasComputeVisualization } =
    useFirstExistingUri([
      "@voxel51/brain/compute_visualization",
      "@voxel51/operators/compute_visualization",
    ]);

  return (
    <Box
      sx={{
        height: "calc(100% - 32px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#262626",
        margin: 2,
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: "510px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: 4,
          borderRadius: 2,
        }}
      >
        <Grid container direction="column" alignItems="center" spacing={2}>
          <Grid item>
            <WorkspacesIcon
              sx={{ fontSize: 64, color: "#ffba85", marginBottom: 2 }}
            />
          </Grid>
          <Grid item>
            <Typography variant="h6" size="14px">
              Embeddings help you explore and understand your dataset
            </Typography>
          </Grid>
          <Grid item>
            <Typography color={secondaryBodyColor}>
              You can compute and visualize embeddings for your dataset using a
              selection of pre-trained models or your own embeddings
            </Typography>
          </Grid>
          <Grid item />
          {!hasComputeVisualization && <OSSContent />}
          {hasComputeVisualization && <TeamsContent />}
        </Grid>
      </Box>
      {hasComputeVisualization && (
        <Box
          sx={{
            position: "absolute",
            bottom: "100px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ViewDocsButton variant="secondary" />
        </Box>
      )}
    </Box>
  );
}

const ViewDocsButton = ({ variant }) => {
  const theme = useTheme();
  const secondaryBodyColor = theme.text.secondary;
  const backgroundColor = variant === "secondary" ? "none" : theme.primary.main;
  const isSecondary = variant === "secondary";

  return (
    <Button
      variant="outlined"
      href="https://docs.voxel51.com/user_guide/app.html#embeddings-panel"
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        backgroundColor,
        color: isSecondary ? secondaryBodyColor : theme.text.primary,
        borderColor: isSecondary ? secondaryBodyColor : undefined,
      }}
      endIcon={<OpenInNewIcon />}
    >
      View Documentation
    </Button>
  );
};

function OSSContent() {
  return (
    <Grid item>
      <ViewDocsButton />
    </Grid>
  );
}

function TeamsContent() {
  const theme = useTheme();
  const secondaryBodyColor = theme.text.secondary;
  return (
    <>
      <Grid item>
        <ComputeVisualizationButton />
      </Grid>
    </>
  );
}
