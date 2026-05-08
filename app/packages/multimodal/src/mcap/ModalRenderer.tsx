import type { SampleRendererProps } from "@fiftyone/plugins";
import { usePlaybackPlan, useSceneInventory } from "../client/hooks";
import { getSampleIdentifiers } from "./sample";

/**
 * Modal proof renderer for MCAP-backed multimodal samples.
 */
export function ModalRenderer({ ctx }: SampleRendererProps) {
  const { datasetId, sampleId } = getSampleIdentifiers(ctx);
  const inventoryState = useSceneInventory(
    datasetId && sampleId ? { datasetId, sampleId } : null
  );
  const playbackPlanState = usePlaybackPlan(
    inventoryState.status === "loaded" && inventoryState.data.inventoryId
      ? { inventoryId: inventoryState.data.inventoryId }
      : null
  );

  return (
    <div>
      <div>Scene inventory ID: {inventoryState.data?.inventoryId}</div>
      <div>Playback ID: {playbackPlanState.data?.planId}</div>
    </div>
  );
}
