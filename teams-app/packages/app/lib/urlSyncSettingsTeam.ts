import { PARAMS, QParamT } from '@fiftyone/teams-state/src/urlSyncCommon';
import { ParsedUrlQuery } from 'querystring';
import { commonQueryParams, normalizeQueryParams } from './urlSyncCommon';
import { toSearchUserFilter } from '@fiftyone/teams-state/src/Settings/team';

const settingsTeamQueryParams: { [key: string]: QParamT } = {
  ...commonQueryParams,
  [PARAMS.SEARCH]: {
    toVariable: (input: string) =>
      input
        ? toSearchUserFilter({
            fields: [],
            term: encodeURIComponent(input as string)
          })
        : null,
    topKey: 'search'
  }
};

export const normalizeSettingsTeamQueryParams = (
  query: ParsedUrlQuery
): { [key: string]: any } => {
  return normalizeQueryParams(query, settingsTeamQueryParams);
};
