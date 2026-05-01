import { DefaultMultimodalQueryClient } from "./query-client";
import type { MultimodalClient, MultimodalQueryRoutes } from "./types";

export interface CreateMultimodalClientOptions {
  readonly routes: MultimodalQueryRoutes;
}

export function createMultimodalClient(
  options: CreateMultimodalClientOptions
): MultimodalClient {
  return {
    queries: new DefaultMultimodalQueryClient({
      routes: options.routes,
    }),
  };
}
