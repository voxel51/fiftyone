/**
 * THIS IS POC CODE FOR DEMO COUPLED WITH NUSCENES.
 * TODO(FOEPD-3830): REPLACE THIS DECODE/FETCH SLICE WITH PRODUCTION CODE.
 */
import type { SampleRendererProps } from "@fiftyone/plugins";
import { useSceneInventory } from "../../client/hooks";
import { getSampleIdentifiers } from "./sample";

/**
 * Grid proof renderer for MCAP-backed multimodal samples.
 */
export function GridRenderer({ ctx }: SampleRendererProps) {
  const { datasetId, sampleId } = getSampleIdentifiers(ctx);
  const inventoryState = useSceneInventory(
    datasetId && sampleId ? { datasetId, sampleId } : null
  );

  if (inventoryState.status === "loaded") {
    return <div>{inventoryState.data.streams.length} streams</div>;
  }

  const message =
    !datasetId || !sampleId
      ? "Inventory identifiers missing"
      : inventoryState.status === "error"
      ? "Inventory unavailable"
      : "Loading inventory";

  return (
    <div>
      <div>{message}</div>
      {inventoryState.status === "error" && (
        <div>{inventoryState.error.message}</div>
      )}
    </div>
  );
}
