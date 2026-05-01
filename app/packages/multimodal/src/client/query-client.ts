import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import { fromBinary } from "@bufbuild/protobuf";
import { getFetchFunction } from "@fiftyone/utilities";
import {
  PlaybackPlanSchema,
  SceneInventorySchema,
  type PlaybackPlan,
  type SceneInventory,
} from "../schemas/v1";
import type {
  MultimodalFetchBody,
  MultimodalQueryClient,
  MultimodalQueryEndpoint,
  MultimodalQueryRoutes,
  PlaybackPlanRequest,
  SceneInventoryRequest,
} from "./types";

export interface DefaultMultimodalQueryClientOptions {
  readonly routes: MultimodalQueryRoutes;
}

export class DefaultMultimodalQueryClient implements MultimodalQueryClient {
  private readonly routes: MultimodalQueryRoutes;

  constructor(options: DefaultMultimodalQueryClientOptions) {
    this.routes = options.routes;
  }

  getSceneInventory(request: SceneInventoryRequest): Promise<SceneInventory> {
    return this.fetchQueryArtifact(
      this.routes.sceneInventory(request),
      SceneInventorySchema
    );
  }

  getPlaybackPlan(request: PlaybackPlanRequest): Promise<PlaybackPlan> {
    return this.fetchQueryArtifact(
      this.routes.playbackPlan(request),
      PlaybackPlanSchema
    );
  }

  private async fetchQueryArtifact<Schema extends DescMessage>(
    endpoint: MultimodalQueryEndpoint,
    schema: Schema
  ): Promise<MessageShape<Schema>> {
    const buffer = await getFetchFunction()<
      MultimodalFetchBody | undefined,
      ArrayBuffer
    >(
      endpoint.method,
      endpoint.path,
      endpoint.body,
      "arrayBuffer",
      endpoint.retries,
      endpoint.retryCodes,
      endpoint.errorHandler,
      endpoint.headers
    );

    return fromBinary(schema, new Uint8Array(buffer));
  }
}
