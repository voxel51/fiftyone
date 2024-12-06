import { ParsedUrlQuery } from "querystring";
import { commonQueryParams, normalizeQueryParams } from "./urlSyncCommon";
import { QParamT } from "@fiftyone/teams-state/src/urlSyncCommon";

// known query parameters
const queryParams: { [key: string]: QParamT } = {
  ...commonQueryParams,
};

export const normalizeDatasetAccessQueryParams = (
  query: ParsedUrlQuery,
  identifier: string
): { [key: string]: any } => {
  return {
    ...normalizeQueryParams(query, queryParams),
    datasetIdentifier: identifier,
  };
};
