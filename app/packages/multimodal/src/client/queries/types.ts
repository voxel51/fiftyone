import type { PlaybackPlan, SceneInventory } from "../../schemas/v1";

/**
 * Identifies the sample whose source inventory should be resolved.
 */
export interface SceneInventoryRequest {
  readonly datasetId: string;
  readonly sampleId: string;
}

/**
 * Identifies the inventory artifact to convert into a playback plan.
 */
export interface PlaybackPlanRequest {
  readonly inventoryId: string;
}

/**
 * Minimal query surface for source-agnostic multimodal server artifacts.
 */
export interface MultimodalQueryClient {
  getSceneInventory(request: SceneInventoryRequest): Promise<SceneInventory>;
  getPlaybackPlan(request: PlaybackPlanRequest): Promise<PlaybackPlan>;
}
