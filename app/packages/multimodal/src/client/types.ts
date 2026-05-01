import type { PlaybackPlan, SceneInventory } from "../schemas/v1";

/**
 * Response body formats currently needed by the multimodal client.
 */
export type MultimodalFetchResultType = "arrayBuffer";

/**
 * JSON-serializable request body accepted by FiftyOne's fetch helper.
 */
export type MultimodalFetchBody =
  | string
  | number
  | boolean
  | null
  | readonly MultimodalFetchBody[]
  | { readonly [field: string]: MultimodalFetchBody | undefined };

/**
 * Narrow type for the subset of `getFetchFunction()` used by multimodal query
 * clients.
 */
export interface MultimodalFetchFunction {
  /**
   * Fetches a path through the configured FiftyOne transport.
   */
  <Body extends MultimodalFetchBody | undefined, Result>(
    /** HTTP method used for the request. */
    method: string,
    /** Server path or absolute URL to request. */
    path: string,
    /** Optional JSON request body. */
    body?: Body,
    /** Expected response body format. */
    result?: MultimodalFetchResultType,
    /** Number of retry attempts handled by the shared fetch helper. */
    retries?: number,
    /** HTTP status codes eligible for retry. */
    retryCodes?: number[],
    /** Optional error hook invoked for unsuccessful responses. */
    errorHandler?: (response: Response) => void | Promise<void>,
    /** Additional request headers. */
    headers?: Record<string, string>
  ): Promise<Result>;
}

/**
 * HTTP methods supported by multimodal query endpoints.
 */
export type MultimodalQueryMethod = "GET" | "POST";

/**
 * Resolved endpoint configuration for a typed multimodal query request.
 */
export interface MultimodalQueryEndpoint {
  /**
   * HTTP method used for the query.
   */
  readonly method: MultimodalQueryMethod;

  /**
   * Server path or absolute URL for the query.
   */
  readonly path: string;

  /**
   * Optional JSON request body.
   */
  readonly body?: MultimodalFetchBody;

  /**
   * Additional request headers.
   */
  readonly headers?: Record<string, string>;

  /**
   * Number of retry attempts handled by the shared fetch helper.
   */
  readonly retries?: number;

  /**
   * HTTP status codes eligible for retry.
   */
  readonly retryCodes?: number[];

  /**
   * Optional error hook invoked for unsuccessful responses.
   */
  readonly errorHandler?: (response: Response) => void | Promise<void>;
}

/**
 * Request for resolving the source inventory associated with a sample.
 */
export interface SceneInventoryRequest {
  /**
   * Stable identifier of the dataset containing the sample.
   */
  readonly datasetId: string;

  /**
   * Stable identifier of the sample whose multimodal inventory should be
   * resolved.
   */
  readonly sampleId: string;
}

/**
 * Request for resolving a playback plan from an inventory artifact.
 */
export interface PlaybackPlanRequest {
  /**
   * Stable identifier of the scene inventory to plan playback from.
   */
  readonly inventoryId: string;
}

/**
 * Route builders used by the query client to map typed requests to server
 * endpoints.
 */
export interface MultimodalQueryRoutes {
  /**
   * Builds the endpoint for fetching a scene inventory protobuf.
   */
  readonly sceneInventory: (
    request: SceneInventoryRequest
  ) => MultimodalQueryEndpoint;

  /**
   * Builds the endpoint for fetching a playback plan protobuf.
   */
  readonly playbackPlan: (
    request: PlaybackPlanRequest
  ) => MultimodalQueryEndpoint;
}

/**
 * Query client for source-agnostic multimodal server artifacts.
 */
export interface MultimodalQueryClient {
  /**
   * Fetches and decodes the scene inventory for a dataset sample.
   */
  getSceneInventory(request: SceneInventoryRequest): Promise<SceneInventory>;

  /**
   * Fetches and decodes the playback plan for a scene inventory.
   */
  getPlaybackPlan(request: PlaybackPlanRequest): Promise<PlaybackPlan>;
}

/**
 * Public multimodal client surface.
 */
export interface MultimodalClient {
  /**
   * Source-agnostic protobuf query client.
   */
  readonly queries: MultimodalQueryClient;

  /**
   * Source resource loading is intentionally deferred. Query artifacts are
   * source-agnostic, but source bytes need format-specific loaders.
   */
  // readonly resources: unknown;
}
