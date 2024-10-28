import { mediaTypeItemsKeys } from "@fiftyone/teams-state/src/constants";
import { ParsedUrlQuery } from "querystring";
import { commonQueryParams, normalizeQueryParams } from "./urlSyncCommon";
import { PARAMS, QParamT } from "@fiftyone/teams-state/src/urlSyncCommon";

// known query parameters
const datasetListQueryParams: { [key: string]: QParamT } = {
  ...commonQueryParams,
  [PARAMS.MEDIA_TYPE]: {
    toVariable: (input: string) => {
      const valueList = input
        .split(",")
        .map((mt) => mt.toUpperCase())
        .filter((mt) => mt && mediaTypeItemsKeys.includes(mt));

      return valueList.length > 0 ? { in: valueList } : null;
    },
    topKey: "filter",
    nestedKey: "mediaType",
  },
  [PARAMS.CREATED_BY]: {
    toVariable: (input: string) =>
      !input || input === "all" ? null : { eq: "mine" },
    topKey: "filter",
    nestedKey: "createdBy",
  },
};

// parse query parameters for DatasetListing page
export const normalizeDatasetListingQueryParams = (
  query: ParsedUrlQuery
): { [key: string]: any } => {
  return normalizeQueryParams(query, datasetListQueryParams);
};
