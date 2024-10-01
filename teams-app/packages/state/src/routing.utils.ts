import Router from 'next/router';
import { DEFAULT_LIST_PAGE_SIZE } from '@fiftyone/teams-state/src/constants';

export const changeRoute = ({
  pathname = '/datasets',
  params = {},
  resetPage = true,
  asParams = null,
  deleteParams = new Set()
}: {
  params: object;
  pathname?: string;
  resetPage?: boolean;
  asParams?: object; // to override url param if needs to be hidden
  deleteParams?: Set<string>; // delete specific parameters from the query
}) => {
  const query = {
    ...Router.query,
    ...(resetPage ? { page: 1, pageSize: DEFAULT_LIST_PAGE_SIZE } : {}),
    ...params
  };
  deleteParams.forEach((pm: string) => {
    delete query[pm];
  });
  const asQuery = {
    ...query,
    ...asParams
  };
  Router.push(
    {
      pathname,
      query
    },
    {
      pathname,
      query: asQuery
    }
  );
};
