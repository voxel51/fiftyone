import { Box, Button, Link, Typography } from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import SettingsIcon from "@mui/icons-material/Settings";
import ImageSearchIcon from "@mui/icons-material/ImageSearch";

/**
 * Component responsible for rendering the 'empty state' of the Data Lens.
 *
 * The empty state is defined to be the state in which there are no available
 *   lens configurations to choose from.
 * This is the first thing that users will see when interacting with Data Lens.
 */
export const EmptyState = ({
  onManageConfigsClick,
}: {
  onManageConfigsClick: () => void;
}) => {
  const steps = [
    {
      icon: CodeIcon,
      text: "Define an operator which exposes custom search parameters",
      description:
        "Tailor your search experience to exactly the queries you want to perform",
    },
    {
      icon: SettingsIcon,
      text: "Register your operator with Data Lens",
      description: "Connect your datasources directly to FiftyOne",
    },
    {
      icon: ImageSearchIcon,
      text: "View samples directly from your connected datasource",
      description:
        "View samples instantly using FiftyOne's advanced visualization capabilities",
    },
  ];

  const renderStep = (step) => {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          mb: 6,
        }}
      >
        <step.icon sx={{ height: "4rem", width: "4rem", mr: 2 }} />

        <Box>
          <Typography variant="h6">{step.text}</Typography>

          <Typography variant="body2">{step.description}</Typography>
        </Box>
      </Box>
    );
  };

  return (
    <>
      <Box sx={{ m: 2 }}>
        <Box sx={{ maxWidth: "750px", m: "auto", p: 2 }}>
          <Typography sx={{ textAlign: "center", mb: 2 }} variant="h1">
            Data Lens
          </Typography>

          <Typography sx={{ textAlign: "center", mb: 8 }} variant="h6">
            Data Lens allows you to connect FiftyOne directly to an external
            datasource
            <br />
            while leveraging your existing data pipelines
          </Typography>

          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              {steps.map((step) => renderStep(step))}
            </Box>
          </Box>

          <Typography sx={{ textAlign: "center", mb: 2 }} variant="h3">
            Ready to get started?
          </Typography>

          <Typography sx={{ textAlign: "center" }} variant="h6">
            <Link href="https://docs.voxel51.com" target="_blank">
              View the documentation
            </Link>

            <Typography>or</Typography>

            <Button onClick={onManageConfigsClick}>
              Configure a datasource
            </Button>
          </Typography>
        </Box>
      </Box>
    </>
  );
};
