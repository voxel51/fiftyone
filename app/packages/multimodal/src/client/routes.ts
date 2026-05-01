import type { MultimodalQueryRoutes } from "./types";

/**
 * Default FiftyOne server routes for source-agnostic multimodal query
 * artifacts.
 */
export const DEFAULT_MULTIMODAL_QUERY_ROUTES: MultimodalQueryRoutes = {
  playbackPlan: (request) => ({
    body: { inventory_id: request.inventoryId },
    method: "POST",
    path: "/multimodal/playback-plan",
  }),
  sceneInventory: (request) => ({
    body: {
      dataset_id: request.datasetId,
      sample_id: request.sampleId,
    },
    method: "POST",
    path: "/multimodal/scene-inventory",
  }),
};
