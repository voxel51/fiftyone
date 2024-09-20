import { PARAMS, QParamT } from '@fiftyone/teams-state/src/urlSyncCommon';
import { ParsedUrlQuery } from 'querystring';
import { toSearchFilter } from '@fiftyone/teams-state';

export const commonQueryParams: { [key: string]: QParamT } = {
  [PARAMS.PAGE]: {
    toVariable: (input: string) => Number(input),
    topKey: 'page'
  },
  [PARAMS.PAGE_SIZE]: {
    toVariable: (input: string) => Number(input),
    topKey: 'pageSize'
  },
  [PARAMS.ORDER_FIELD]: {
    toVariable: (input: string) => input,
    topKey: 'order',
    nestedKey: 'field'
  },
  [PARAMS.ORDER_DIRECTION]: {
    toVariable: (input: string) => {
      if (['asc', 'desc', 'ASC', 'DESC'].includes(input))
        return input.toUpperCase();
      return 'ASC';
    },
    topKey: 'order',
    nestedKey: 'direction'
  },
  [PARAMS.SEARCH]: {
    toVariable: (input: string) =>
      input
        ? toSearchFilter({
            fields: [],
            term: encodeURIComponent(input as string)
          })
        : null,
    topKey: 'search'
  }
};

// parse query parameters
export const normalizeQueryParams = (
  query: ParsedUrlQuery,
  queryParams: {
    [key: string]: QParamT;
  }
): { [key: string]: any } => {
  const normalizedQuery: { [key: string]: any } = {};

  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== 'string') {
      throw new Error(`bad parameter ${key}: '${value?.toString()}'`);
    }

    // unknown query parameter
    if (!value || !(key in queryParams)) continue;
    const qParam = queryParams?.[key];
    const { topKey, nestedKey } = qParam;

    const res = qParam.toVariable(value);
    if (!res) continue; // bad/unset parameter

    if (!nestedKey) {
      normalizedQuery[topKey] = res;
    } else {
      normalizedQuery[topKey] = {
        ...normalizedQuery[topKey],
        [nestedKey]: res
      };
    }
  }
  return normalizedQuery;
};
