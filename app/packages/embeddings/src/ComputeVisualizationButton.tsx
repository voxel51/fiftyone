import { Button } from "@mui/material";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import AddIcon from "@mui/icons-material/Add";
import { useTheme } from "@fiftyone/components";

export default function ComputeVisualizationButton() {
  const triggerEvent = usePanelEvent();
  const theme = useTheme();
  const panelId = usePanelId();
  return (
    <Button
      variant="contained"
      sx={{
        backgroundColor: theme.primary.main,
        color: theme.text.primary,
      }}
      startIcon={<AddIcon />}
      onClick={() => {
        triggerEvent(panelId, {
          params: { delegate: true },
          operator: "@voxel51/brain/compute_visualization",
          prompt: true,
        });
      }}
    >
      Compute Visualization
    </Button>
  );
}
