import {
  defaultMultimodalQueryClient,
  type MultimodalQueryClient,
} from "./queries";
import {
  defaultMultimodalResourcesClient,
  type MultimodalResourcesClient,
} from "./resources";

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

export * from "./queries";
export * from "./resources";
