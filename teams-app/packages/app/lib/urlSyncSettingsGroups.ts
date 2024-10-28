import { toSearchGroupFilter } from "@fiftyone/teams-state/src/Settings/groups";
import { PARAMS, QParamT } from "@fiftyone/teams-state/src/urlSyncCommon";
import { ParsedUrlQuery } from "querystring";
import { commonQueryParams, normalizeQueryParams } from "./urlSyncCommon";

// known query parameters
const settingsGroupQueryParams: { [key: string]: QParamT } = {
  ...commonQueryParams,
  [PARAMS.SEARCH]: {
    toVariable: (input: string) =>
      input
        ? toSearchGroupFilter({
            fields: [],
            term: encodeURIComponent(input as string),
          })
        : null,
    topKey: "search",
  },
};

export const normalizeSettingsGroupListQueryParams = (
  query: ParsedUrlQuery
): { [key: string]: any } => {
  return normalizeQueryParams(query, settingsGroupQueryParams);
};
