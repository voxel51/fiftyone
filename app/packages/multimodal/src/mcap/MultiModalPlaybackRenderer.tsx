import type { SampleRendererProps } from "@fiftyone/plugins";
import { getBasename } from "@fiftyone/utilities";
import { usePlaybackPlan, useSceneInventory } from "../client/hooks";
import MultiModalPlayback from "../components/MultiModalPlayback/MultiModalPlayback";
import { getSampleIdentifiers } from "./sample";

export function MultiModalPlaybackRenderer({ ctx }: SampleRendererProps) {
  const { datasetId, sampleId } = getSampleIdentifiers(ctx);
  const inventoryState = useSceneInventory(
    datasetId && sampleId ? { datasetId, sampleId } : null
  );
  usePlaybackPlan(
    inventoryState.status === "loaded" && inventoryState.data.inventoryId
      ? { inventoryId: inventoryState.data.inventoryId }
      : null
  );

  const filepath = ctx.sample.sample.filepath;
  const fileName = getBasename(filepath) ?? filepath;

  return <MultiModalPlayback fileName={fileName} />;
}
