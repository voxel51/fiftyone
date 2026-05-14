import {
  PlaybackPlanSchema,
  SceneInventorySchema,
  type PlaybackPlan,
  type SceneInventory,
} from "../../schemas/v1";
import { fetchProtobuf } from "./fetch-protobuf";
import type {
  MultimodalQueryClient,
  PlaybackPlanRequest,
  SceneInventoryRequest,
} from "./types";

/**
 * Default query client backed by FiftyOne's multimodal server routes.
 */
export const defaultMultimodalQueryClient: MultimodalQueryClient = {
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
