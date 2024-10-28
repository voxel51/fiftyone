import { Box, Button, Link, Typography, Grid } from "@mui/material";
import { useTheme } from "@fiftyone/components";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ComputeVisualizationButton from "./ComputeVisualizationButton";

export default function EmptyEmbeddings() {
  const theme = useTheme();
  const secondaryBodyColor = theme.text.secondary;
  const isTeams = false;

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
            <ScatterPlotIcon
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
              Compute and visualize embeddings for your dataset using a
              selection of pre-trained models or your own embeddings
            </Typography>
          </Grid>
          {!isTeams && <OSSContent />}
          {isTeams && <TeamsContent />}
        </Grid>
      </Box>
    </Box>
  );
}

function OSSContent() {
  const theme = useTheme();
  const secondaryBodyColor = theme.text.secondary;
  return (
    <>
      <Grid item>
        <Typography color={secondaryBodyColor}>
          Learn more about using embeddings in the open source:
        </Typography>
      </Grid>
      <Grid item>
        <Button
          variant="contained"
          color="warning"
          href="https://docs.voxel51.com/user_guide/app.html#embeddings-panel"
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            backgroundColor: theme.primary.main,
            color: theme.text.primary,
          }}
          endIcon={<OpenInNewIcon />}
        >
          View Documentation
        </Button>
      </Grid>
    </>
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
