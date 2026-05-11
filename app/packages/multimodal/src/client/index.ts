import {
  PlaybackPlanSchema,
  SceneInventorySchema,
  type PlaybackPlan,
  type SceneInventory,
} from "../schemas/v1";
import { fetchProtobuf } from "./fetch-protobuf";
import {
  defaultMultimodalResourcesClient,
  type MultimodalResourcesClient,
} from "./resources";

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
 * Public multimodal client split by source-agnostic queries and adapter
 * resources.
 */
export interface MultimodalClient {
  readonly queries: MultimodalQueryClient;
  readonly resources: MultimodalResourcesClient;
}

/**
 * Options used to construct a multimodal client.
 */
export interface CreateMultimodalClientOptions {
  readonly queries?: MultimodalQueryClient;
  readonly resources?: MultimodalResourcesClient;
}

/**
 * Default query client backed by FiftyOne's multimodal server routes.
 */
export const defaultMultimodalQueryClient: MultimodalQueryClient = {
  getPlaybackPlan,
  getSceneInventory,
};

/**
 * Creates the public multimodal client surface.
 */
export function createMultimodalClient(
  options: CreateMultimodalClientOptions = {}
): MultimodalClient {
  return {
    queries: options.queries ?? defaultMultimodalQueryClient,
    resources: options.resources ?? defaultMultimodalResourcesClient,
  };
}

/**
 * Default multimodal client.
 */
export const defaultMultimodalClient = createMultimodalClient();

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
export * from "./resources";
