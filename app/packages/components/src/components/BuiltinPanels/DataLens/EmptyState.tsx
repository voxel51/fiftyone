import { Box, Button, Card, Grid, Tooltip, Typography } from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import HubIcon from "@mui/icons-material/HubOutlined";
import CenterFocusWeakIcon from "@mui/icons-material/CenterFocusWeak";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

/**
 * Model defining the UX for an onboarding step.
 */
type StepConfig = {
  icon: React.FC;
  text: string;
  description: string;
  extra?: React.ReactNode;
};

/**
 * Component responsible for rendering the 'empty state' of the Data Lens.
 *
 * The empty state is defined to be the state in which there are no available
 *   lens configurations to choose from.
 * This is the first thing that users will see when interacting with Data Lens.
 */
export const EmptyState = ({
  onManageConfigsClick,
  disabled,
}: {
  onManageConfigsClick?: () => void;
  disabled?: boolean;
}) => {
  const steps: StepConfig[] = [
    {
      icon: CodeIcon,
      text: "Define your pipeline",
      description: "Tell FiftyOne how to query your data source",
      extra: (
        <Button
          endIcon={<OpenInNewIcon />}
          variant="outlined"
          color="secondary"
          href="https://docs.voxel51.com/teams/data_lens.html"
          target="_blank"
        >
          Data Lens Docs
        </Button>
      ),
    },
    {
      icon: HubIcon,
      text: "Connect to your data sources",
      description: "Register your operator to connect to a data source",
      extra: (
        <Box>
          <Typography sx={{ mb: 1 }}>Get started:</Typography>
          <Tooltip
            title={disabled ? "You do not have sufficient permission" : ""}
          >
            <span>
              <Button
                variant="contained"
                disabled={disabled}
                onClick={onManageConfigsClick}
              >
                Connect to a data source
              </Button>
            </span>
          </Tooltip>
        </Box>
      ),
    },
    {
      icon: CenterFocusWeakIcon,
      text: "Easily view samples within FiftyOne",
      description:
        "View samples from your data source and import them to a dataset",
    },
  ];

  const renderStep = (step: StepConfig, stepNumber: number) => {
    return (
      <Box sx={{ mb: 6 }}>
        <Grid container spacing={2}>
          <Grid
            item
            xs={2}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <step.icon sx={{ fontSize: "3rem", color: "#FFC59B" }} />
          </Grid>
          <Grid item xs={10}>
            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {stepNumber}. {step.text}
              </Typography>

              <Typography color="secondary">{step.description}</Typography>
            </Box>
          </Grid>

          <Grid item xs={2}>
            {/*Empty grid cell to preserve spacing*/}
          </Grid>
          <Grid item xs={10}>
            {step.extra}
          </Grid>
        </Grid>
      </Box>
    );
  };

  return (
    <>
      <Box sx={{ maxWidth: "750px", m: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "bottom", mb: 2 }}>
          <CenterFocusWeakIcon sx={{ fontSize: "3rem", mr: 2 }} />
          <Typography variant="h4">Data Lens</Typography>
        </Box>

        <Typography sx={{ mb: 3 }} variant="h6">
          Data Lens enables you to seamlessly explore samples in your external
          data sources and import content directly into a FiftyOne Dataset.
        </Typography>

        <Typography sx={{ mb: 1 }} color="secondary">
          How to get started with the Beta experience:
        </Typography>
        <Card square={false}>
          <Box sx={{ margin: "3rem 1rem" }}>
            {steps.map((step, idx) => renderStep(step, 1 + idx))}
          </Box>
        </Card>
      </Box>
    </>
  );
};
