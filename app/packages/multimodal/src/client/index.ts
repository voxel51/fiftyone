import {
  PlaybackPlanSchema,
  SceneInventorySchema,
  type PlaybackPlan,
  type SceneInventory,
} from "../schemas/v1";
import { fetchProtobuf } from "./fetch-protobuf";

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

/**
 * Default query client backed by FiftyOne's multimodal server routes.
 */
export const defaultMultimodalClient: MultimodalQueryClient = {
  getPlaybackPlan,
  getSceneInventory,
};

/**
 * Fetches the inventory artifact for a dataset sample.
 */
export function getSceneInventory(
  request: SceneInventoryRequest
): Promise<SceneInventory> {
  const sceneInventoryPath = `/dataset/${encodeURIComponent(
    request.datasetId
  )}/sample/${encodeURIComponent(request.sampleId)}/multimodal/scene-inventory`;
  return fetchProtobuf(sceneInventoryPath, SceneInventorySchema);
}

/**
 * Fetches the playback plan for an inventory artifact.
 */
export function getPlaybackPlan(
  request: PlaybackPlanRequest
): Promise<PlaybackPlan> {
  const playbackPlanPath = `/multimodal/playback-plan/${encodeURIComponent(
    request.inventoryId
  )}`;
  return fetchProtobuf(playbackPlanPath, PlaybackPlanSchema);
}

export { fetchProtobuf } from "./fetch-protobuf";
