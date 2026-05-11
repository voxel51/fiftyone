import { useMemo } from "react";
import type { SceneInventory } from "../../schemas/v1";
import {
  defaultMultimodalClient,
  type MultimodalQueryClient,
  type SceneInventoryRequest,
} from "../index";
import type { MultimodalQueryState } from "./types";
import { useMultimodalQuery } from "./use-multimodal-query";

/**
 * Loads the scene inventory for a dataset sample.
 */
export function useSceneInventory(
  request: SceneInventoryRequest | null | undefined,
  client: MultimodalQueryClient = defaultMultimodalClient.queries
): MultimodalQueryState<SceneInventory> {
  const datasetId = request?.datasetId;
  const sampleId = request?.sampleId;

  const load = useMemo(() => {
    if (!datasetId || !sampleId) {
      return null;
    }

    return () => client.getSceneInventory({ datasetId, sampleId });
  }, [client, datasetId, sampleId]);

  return useMultimodalQuery(load);
}
