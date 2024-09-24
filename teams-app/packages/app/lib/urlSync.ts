import { ParsedUrlQuery } from 'querystring';
import { VariablesOf } from 'relay-runtime';
import { normalizeDatasetListingQueryParams } from './urlSyncDatasetListing';
import { normalizeSettingsTeamQueryParams } from './urlSyncSettingsTeam';
import { normalizeSettingsGroupListQueryParams } from './urlSyncSettingsGroups';
import { normalizeSettingsGroupQueryParams } from './urlSyncSettingsGroup';
import { normalizeDatasetAccessQueryParams } from './urlSyncDatasetAccess';

// parse query parameters to be sent as POST request variables to GQL
export const normalizeQueryParams = (
  query: ParsedUrlQuery,
  pathname: string,
  asPath?: string
): Partial<VariablesOf<Q>> => {
  // for dataset listing page
  if (pathname.endsWith('/datasets')) {
    return normalizeDatasetListingQueryParams(query);
  }
  if (pathname.endsWith('/settings/team/users')) {
    return normalizeSettingsTeamQueryParams(query);
  }
  if (pathname.endsWith('/settings/team/groups')) {
    return normalizeSettingsGroupListQueryParams(query);
  }
  if (pathname.match('/settings/team/groups/.*$')) {
    // Extract the group identifier from the 'asPath'
    const groupPathRegex = /\/settings\/team\/groups\/(.*)$/;
    const match = groupPathRegex.exec(asPath || '');
    if (match) {
      const fullPath = match[1];
      const groupId = fullPath.split('?')?.[0]; // Separates the groupId from any query parameters

      return normalizeSettingsGroupQueryParams(query, groupId);
    }
  }
  if (pathname.match('/datasets/.*/manage/access$')) {
    const groupPathRegex = /\/datasets\/(.*)\/manage\/access$/;
    const match = groupPathRegex.exec(asPath?.replace('.json', '') || '');
    if (match) {
      const identifier = match[1];

      return normalizeDatasetAccessQueryParams(query, identifier);
    }
  }
  return query;
};
