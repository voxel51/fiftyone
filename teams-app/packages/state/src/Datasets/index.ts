import { SORT_OPTIONS } from '@fiftyone/teams-components/src/DatasetListFilterBar/constants';
import * as DatasetsListQuery from '@fiftyone/teams-state/src/Datasets/__generated__/DatasetsListQuery.graphql';
import { SearchSuggestionQuery$data } from '@fiftyone/teams-state/src/Search/__generated__/SearchSuggestionQuery.graphql';
import {
  DEFAULT_LIST_PAGE_SIZE,
  DEFAULT_PAGE,
  mediaTypeItemsKeys
} from '@fiftyone/teams-state/src/constants';
import { some, startCase, uniqBy } from 'lodash';
import Router from 'next/router';
import { graphql } from 'react-relay/hooks';
import { RecoilState, atom, selector } from 'recoil';
import { graphQLSelector } from 'recoil-relay';
import { recoilEnvironmentKey } from '../Common/recoil-env';
import { TheSearchSuggestionQuery } from '../Search/index';
import { PARAMS } from '../urlSyncCommon';

type SearchableSuggestionFields = 'Dataset' | 'Tag' | 'Name';
const defaultSearchListingFields: ListingSearchFields[] = ['name', 'tags'];

export type SearchSuggestionResult =
  | {
      field: DatasetsListQuery.DatasetSearchFields;
      type: 'Dataset' | 'MediaType' | 'Tag';
      label: string;
      slug?: string;
    }
  | { label: string; type: 'hidden_count' }
  | { help: string; label: string; type: 'help' };

export const defaultSearchFields: SearchableSuggestionFields[] = [
  'Tag',
  'Dataset'
];
export interface DatasetListingSearchExpression {
  fields: string[];
  term: string;
}
type ListingSearchFields = DatasetsListQuery.DatasetSearchFields;
export type FieldValueListingSearch = {
  fields: ListingSearchFields[];
  term: string;
};

export const searchSuggestions = graphQLSelector({
  key: 'searchSuggestions',
  environment: recoilEnvironmentKey,
  query: TheSearchSuggestionQuery,
  variables: ({ get }) => {
    const searchExpression = get(searchExpressionState);

    // no need to fire up the query
    if (!searchExpression) {
      return null;
    }

    return {
      searchTerm: searchExpression.value,
      searchTypes: searchExpression.fields
    };
  },
  mapResponse: (data: SearchSuggestionQuery$data): SearchSuggestionResult[] => {
    return uniqBy(
      data.search.map((data) => {
        switch (data.__typename) {
          case 'Dataset':
            return {
              type: data.__typename,
              label: data.name,
              field: 'name',
              slug: data.slug
            };
          case 'Tag':
            return { type: data.__typename, label: data.text, field: 'tags' };
          case 'MediaType':
            return {
              type: data.__typename,
              label: data.type,
              field: 'mediaType'
            };
          default:
            break;
        }
      }),
      ({ type, label }) => `${type}-${label}`
    );
  },
  default: []
});

// TODO: deprecate and use a shared one
export const changeRoute = ({
  pathname = '/datasets',
  params = {},
  resetPage = true,
  asParams = null
}: {
  params: object;
  pathname?: string;
  resetPage?: boolean;
  asParams?: object; // to override url param if needs to be hidden
}) => {
  const query = {
    ...Router.query,
    ...(resetPage ? { page: 1, pageSize: DEFAULT_LIST_PAGE_SIZE } : {}),
    ...params
  };

  Router.push(
    {
      pathname,
      query
    },
    {
      pathname,
      query: {
        ...query,
        ...asParams
      }
    }
  );
};

export const createdByUserState: RecoilState<string> = atom({
  key: 'createdByUserState',
  default: 'all',
  effects: [
    ({ trigger, onSet, setSelf }) => {
      if (trigger === 'get') {
        if (Router.query?.[PARAMS.CREATED_BY] === 'mine') {
          setSelf('mine');
        }
      }
      onSet((newValue, _, isReset) => {
        setSelf(newValue);
        if (!isReset) {
          changeRoute({
            params: { createdBy: newValue }
          });
        }
      });
      Router.events.on('routeChangeComplete', () => {
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        const newCreatedBy = urlParams.get(PARAMS.CREATED_BY);
        if (newCreatedBy) {
          setSelf(newCreatedBy);
        }
      });
    }
  ]
});

export const isSearchOrFiltersSelector = selector({
  key: 'isSearchOrFiltersSelector',
  get: ({ get }) => {
    const searchInput = get(searchInputState);
    const isSearchActive = searchInput?.length > 0;

    const mediaTypes = get(mediaTypeState);
    const isMediaTypeActive = mediaTypes.length;

    return Boolean(isSearchActive || isMediaTypeActive);
  }
});

export const searchHelpTextSelector = selector<string>({
  key: 'searchHelpTextSelector',
  get: ({ get }) => {
    const searchExpr = get(searchExpressionState);
    const { value, fields } = searchExpr;
    if (fields.length > 1 && value) {
      return `Search datasets matching ${value}`;
    }
    if (fields.length === 1 && value) {
      const fieldText = fields[0] === 'Tag' ? 'tags' : 'datasets';
      return `Search ${fieldText} containing ${value}`;
    }
    return 'Search datasets';
  }
});

const getCurrentSortOption = () => {
  const querySortField = Router.query?.[PARAMS.ORDER_FIELD];
  const querySortDirection = (
    Router.query?.[PARAMS.ORDER_DIRECTION] as string
  )?.toUpperCase();
  return (
    SORT_OPTIONS.filter(({ field, direction }) => {
      return field === querySortField && direction === querySortDirection;
    })?.[0] || SORT_OPTIONS[0]
  );
};

export const datasetListSortState = atom({
  key: 'datasetListSortState',
  default: SORT_OPTIONS[0],
  effects: [
    ({ trigger, onSet, setSelf }) => {
      if (trigger == 'get') {
        setSelf(getCurrentSortOption());
      }
      onSet((newValue, oldValue) => {
        if (newValue && newValue !== oldValue) {
          changeRoute({
            params: {
              [PARAMS.ORDER_FIELD]: newValue.field,
              [PARAMS.ORDER_DIRECTION]: newValue.direction.toLowerCase()
            }
          });
        }
      });
      Router.events.on('routeChangeComplete', () => {
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);

        if (Router.query?.[PARAMS.CREATED_BY] === 'mine') {
          if (!urlParams.get(PARAMS.ORDER_FIELD)) {
            setSelf(SORT_OPTIONS[0]);
          }
        } else {
          setSelf(getCurrentSortOption());
        }
      });
    }
  ]
});

export const datasetListPageInfoState = atom({
  key: 'datasetListPageInfoState',
  default: { page: DEFAULT_PAGE, pageSize: DEFAULT_LIST_PAGE_SIZE },
  effects: [
    ({ trigger, onSet, setSelf }) => {
      if (trigger == 'get') {
        setSelf({
          page: Number(Router.query?.page || 1),
          pageSize: Number(Router.query?.pageSize || DEFAULT_LIST_PAGE_SIZE)
        });
      }
      onSet((newValue, oldValue) => {
        if (newValue && newValue !== oldValue) {
          changeRoute({
            params: newValue,
            resetPage: false
          });
        }
      });
      Router.events.on('routeChangeComplete', () => {
        const queryString = window.location.search;
        const urlPram = new URLSearchParams(queryString);
        const pageSize = Number(
          urlPram.get(PARAMS.PAGE_SIZE) || DEFAULT_LIST_PAGE_SIZE
        );
        const page = Number(urlPram.get(PARAMS.PAGE) || 1);
        setSelf({ page, pageSize });
      });
    }
  ]
});

export const searchInputState = atom({
  key: 'searchInput',
  default: '',
  effects: [
    ({ trigger, setSelf }) => {
      if (trigger == 'get') {
        const srch = Router.query?.search;
        if (srch) {
          setSelf(srch as string);
        } else {
          delete Router.query?.[PARAMS.SEARCH];
          Router.replace({
            pathname: '/datasets',
            query: Router.query
          });
        }
      }
      Router.events.on('routeChangeComplete', () => {
        const queryString = window.location.search;
        const urlPram = new URLSearchParams(queryString);
        const searchParam = urlPram.get(PARAMS.SEARCH);

        if (searchParam) {
          setSelf(searchParam);
        }
      });
    }
  ]
});

export const searchTermState = atom({
  key: 'search',
  default: '',
  effects: [
    ({ trigger, onSet, setSelf, getPromise }) => {
      if (trigger == 'get') {
        setSelf(Router.query?.search as string);
      }
      onSet(async (_, __, isReset) => {
        if (isReset) {
          delete Router.query?.[PARAMS.SEARCH];
          const { pageSize } = await getPromise(datasetListPageInfoState);
          changeRoute({
            params: {
              ...Router.query,
              ...{ page: 1, pageSize }
            }
          });
        }
      });
    }
  ]
});

export const datasetSearchTermState: RecoilState<DatasetListingSearchExpression | null> =
  atom({
    key: 'datasetSearchTermState',
    default: null,
    effects: [
      ({ trigger, onSet, setSelf }) => {
        if (trigger == 'get') {
          setSelf(
            toSearchFilter({
              term: Router.query?.search as string,
              fields: []
            })
          );
        }
        onSet((newValue, oldValue) => {
          if (oldValue !== newValue && newValue?.term) {
            changeRoute({ params: { search: newValue.term } });
          }
        });
      }
    ]
  });

export type FieldValueSearch = {
  fields: SearchableSuggestionFields[];
  value: string;
};
const searchExpressionState = selector<FieldValueSearch>({
  key: 'searchExpressionState',
  get: ({ get }) => {
    const rawSearch = get(searchTermState);
    if (!rawSearch) {
      return {
        fields: defaultSearchFields,
        value: ''
      };
    }
    const rawSplit = rawSearch.split(':');
    let fields = defaultSearchFields;
    let value = rawSearch.replace(':', '');

    if (rawSplit.length > 1) {
      let potentialField = startCase(rawSplit[0]) as SearchableSuggestionFields;

      // so name:foo works
      if (potentialField === 'Name') {
        potentialField = 'Dataset';
      }

      const potentialValue = rawSplit[1] as string;

      if (defaultSearchFields.includes(potentialField) && potentialValue) {
        fields = [potentialField];
        value = potentialValue;
      }
    }

    return {
      fields,
      value
    };
  }
});

export const mediaTypeState: RecoilState<string[]> = atom({
  key: 'mediaTypeState',
  default: [],
  effects: [
    ({ trigger, onSet, setSelf }) => {
      if (trigger == 'get') {
        const queryMediaTypes = Router.query?.mediaType as string;
        if (queryMediaTypes) {
          const mediaTypes = queryMediaTypes
            .split(',')
            .map((mt) => mt.toUpperCase());
          setSelf(mediaTypes);
        }
      }
      onSet((newValue, oldValue) => {
        if (newValue && newValue !== oldValue) {
          const unselectAll = some(newValue, (item) => item === null);
          if (unselectAll) {
            delete Router.query?.[PARAMS.MEDIA_TYPE];
            changeRoute({ params: Router.query });
            return;
          }
          const newMediaTypes = newValue
            .map((nv) => nv.toLowerCase())
            .join(',');
          if (newMediaTypes.length) {
            changeRoute({
              params: { mediaType: newMediaTypes }
            });
          } else {
            if (Router.query?.[PARAMS.MEDIA_TYPE]) {
              delete Router.query?.[PARAMS.MEDIA_TYPE];
              changeRoute({ params: Router.query });
            }
          }
        }
      });
      Router.events.on('routeChangeComplete', () => {
        const queryString = window.location.search;
        const urlPram = new URLSearchParams(queryString);
        const currMediaTypes = urlPram.get(PARAMS.MEDIA_TYPE)?.split(',') || [];
        if (!currMediaTypes.length) {
          setSelf([]);
        } else {
          setSelf(
            currMediaTypes
              .filter(
                (mt) =>
                  Boolean(mt) && mediaTypeItemsKeys.includes(mt.toUpperCase())
              )
              .map((mt) => mt.toUpperCase())
          );
        }
      });
    }
  ]
});

export const toSearchFilter = (search: DatasetListingSearchExpression) => {
  if (!search?.term) {
    return {
      fields: defaultSearchListingFields,
      term: ''
    };
  }
  const rawSearch = decodeURIComponent(search.term);

  const rawSplit = rawSearch.split(':');
  let fields = search.fields.length
    ? search.fields
    : defaultSearchListingFields;
  let term = rawSearch;

  if (rawSplit.length > 1) {
    let potentialFieldRaw = rawSplit[0];
    const potentialValue = rawSplit[1] as string;

    // DO NOT DELETE
    // Listing Search Fields could be TAG, but search fields expected to be tags
    const potentialField = potentialFieldRaw as ListingSearchFields;
    if (potentialFieldRaw === 'tag') {
      potentialFieldRaw = 'tags';
    }

    if (defaultSearchListingFields.includes(potentialField) && potentialValue) {
      fields = [potentialField];
      term = potentialValue;
    }
  }

  return {
    fields,
    term
  };
};

export const TheDatasetsListQuery = graphql`
  query DatasetsListQuery(
    $filter: DatasetFilter
    $search: DatasetSearchFieldsSearch
    $order: DatasetOrderFieldsOrder!
    $pageSize: Int!
    $page: Int!
  ) {
    datasetsPage(
      filter: $filter
      search: $search
      order: $order
      pageSize: $pageSize
      page: $page
    ) {
      prev
      page
      next
      nodes {
        id
        name
        lastLoadedAt
        viewer {
          pinned
        }
        samplesCount
        sampleFieldsCount
        tags
        mediaType
        createdAt
        slug
      }
      pageSize
      pageTotal
      nodeTotal
    }
  }
`;

export const DatasetsPinnedQuery = graphql`
  query DatasetsPinnedQuery {
    datasets(filter: { userPinned: true }) {
      name
      samplesCount
    }
  }
`;

export const datasetsRootQuery = graphql`
  query DatasetsRootQuery(
    $after: String = null
    $filter: DatasetFilter
    $first: Int!
    $order: DatasetOrderFieldsOrder!
  ) {
    ...DatasetsConnectionFragment
    ...DatasetsCountFragment
  }
`;

export const datasetsConnectionFragment = graphql`
  fragment DatasetsConnectionFragment on Query
  @refetchable(queryName: "DatasetsConnectionPaginationQuery") {
    datasetsConnection(
      after: $after
      first: $first
      filter: $filter
      order: $order
    ) @connection(key: "DatasetsConnectionFragment_datasetsConnection") {
      __id
      edges {
        node {
          ...DatasetFrag
        }
      }
    }
  }
`;

export const datasetsCountFragment = graphql`
  fragment DatasetsCountFragment on Query
  @refetchable(queryName: "DatasetsCountQuery") {
    datasetsCount(filter: $filter)
  }
`;

export const setDatasetPinnedMutation = graphql`
  mutation DatasetsSetPinnedMutation(
    $datasetIdentifier: String!
    $userId: String
    $pinned: Boolean
  ) {
    setDatasetPinned(
      datasetIdentifier: $datasetIdentifier
      userId: $userId
      pinned: $pinned
    ) {
      __typename
      id
      name
      slug
      viewer {
        pinned
      }
    }
  }
`;

export const updateDatasetViewLastLoadedAtMutation = graphql`
  mutation DatasetsUpdateViewLastLoadedAtMutation(
    $datasetId: String!
    $viewId: String!
    $viewName: String!
  ) {
    updateViewActivity(
      datasetId: $datasetId
      viewId: $viewId
      viewName: $viewName
    )
  }
`;

export const datasetsV2ConnectionFragment = graphql`
  fragment DatasetsV2ConnectionFragment on Query
  @refetchable(queryName: "DatasetsV2ConnectionPaginationQuery") {
    datasetsConnection(
      after: $after
      first: $first
      filter: $filter
      order: $order
    ) @connection(key: "DatasetsV2ConnectionFragment_datasetsConnection") {
      __id
      edges {
        node {
          ...DatasetFrag
        }
      }
    }
  }
`;

export const initialQuery = graphql`
  query DatasetsV2RootQuery(
    $filter: DatasetFilter
    $order: DatasetOrderFieldsOrder!
    $search: DatasetSearchFieldsSearch
    $pageSize: Int!
    $page: Int!
    $firstViews: Int = 5
  ) {
    ...RecentViewsListFragment
    ...DatasetListFragment
    ...CurrentUserFragment
  }
`;
