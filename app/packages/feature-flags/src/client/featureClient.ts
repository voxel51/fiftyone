import { getFetchFunction } from "@fiftyone/utilities";

/**
 * Response type for ListFeatures API.
 */
export type ListFeaturesResponse = {
  features: string[];
};

/**
 * List enabled features.
 */
export const listEnabledFeatures = (): Promise<ListFeaturesResponse> => {
  return getFetchFunction()("GET", "/features");
};
