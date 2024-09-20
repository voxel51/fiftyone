import { ParsedUrlQuery } from 'querystring';
import { commonQueryParams, normalizeQueryParams } from './urlSyncCommon';
import { QParamT } from '@fiftyone/teams-state/src/urlSyncCommon';

// known query parameters
const settingsGroupQueryParams: { [key: string]: QParamT } = {
  ...commonQueryParams
};

export const normalizeSettingsGroupQueryParams = (
  query: ParsedUrlQuery,
  identifier: string
): { [key: string]: any } => {
  return {
    ...normalizeQueryParams(query, settingsGroupQueryParams),
    identifier
  };
};
