import { Button } from "@fiftyone/components";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";

export default function ComputeVisualizationButton() {
  const triggerEvent = usePanelEvent();
  const panelId = usePanelId();
  return (
    <Button
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
