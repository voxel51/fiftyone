import { Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useTheme } from "@fiftyone/components";

export default function ComputeVisualizationButton({ variant, onClick }) {
  const theme = useTheme();

  if (variant === "box") {
    return (
      <Button
        variant="outlined"
        sx={{
          borderColor: theme.primary.main,
          color: theme.primary.main,
        }}
        startIcon={<AddIcon />}
        onClick={onClick}
      >
        Compute Visualization
      </Button>
    );
  }

  return (
    <Button
      variant="contained"
      sx={{
        backgroundColor: theme.primary.main,
        color: theme.text.primary,
      }}
      startIcon={<AddIcon />}
      onClick={onClick}
    >
      Compute Visualization
    </Button>
  );
}
