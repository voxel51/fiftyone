import { CurrentUserFragment$data } from '@fiftyone/hooks';
import { graphql } from 'react-relay';
import {
  RecoilState,
  SetterOrUpdater,
  atom,
  atomFamily,
  selector,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState
} from 'recoil';
import { graphQLSelector, graphQLSelectorFamily } from 'recoil-relay';
import { recoilEnvironmentKey } from './Common/recoil-env';
import { datasetBySlugQuery } from './Dataset';
import * as DatasetGetBySlugQuery from './Dataset/__generated__/DatasetBySlugQuery.graphql';
import { DatasetsPinnedQuery } from './Datasets/index';
import * as SearchByTagQuery from './Search/__generated__/SearchDatasetTagsQuery.graphql';
export * from './clientEnvironments';
export * from './permissions';
export * from './query-types';
export * from './types';

//
// Global
//
export const mainTitleState = atom({
  key: 'mainTitleState',
  default: 'Settings'
});
export const hostState = atom({
  key: 'hostState',
  default: ''
});

// provide a set function to have a "writable" selector
export const mainTitleSelector = selector({
  key: 'mainTitleSelector',
  get: ({ get }) => get(mainTitleState),
  set: ({ set }, newValue) => set(mainTitleState, newValue)
});

// dataset being added/possibly edited
export const newDatasetNameState = atom({
  key: 'newDatasetName',
  default: ''
});
export const nameAvailableState = atom({
  key: 'nameAvailableState',
  default: false
});
export const newDatasetDescriptionState = atomFamily({
  key: 'newDatasetDescriptionState',
  default: (param?: string) => {
    return param || '';
  }
});
export const newDatasetTagsState = atomFamily({
  key: 'newDatasetTagsState',
  default: (param: { label: string; value: string }[] | null) => {
    return param;
  }
});
export const newDatasetState = atom({
  key: 'newDatasetState',
  default: null
});
export const cloneDatasetState = atom({
  key: 'cloneDatasetState',
  default: null
});

//
// Datasets
//

export const datasetListOptions = atom({
  key: 'datasetListOptions',
  default: { query: '' }
});

export const currentUser = atom<CurrentUserFragment$data | null>({
  key: 'currentUser',
  default: null
});

export const currentDatasetSlug: RecoilState<string> = atom({
  key: 'currentDatasetSlug',
  default: ''
});

export const lastPinToggledDatasetState = atom({
  key: 'lastPinToggledDatasetState',
  default: null
});

export const datasetTagSearchTermState = atom({
  key: 'datasetTagSearchTermState',
  default: ''
});

export const datasetListCountState = atom({
  key: 'datasetListCountState',
  default: 0
});

export const exampleGraphQLSelector = graphQLSelector({
  key: 'exampleGraphQLSelector',
  environment: recoilEnvironmentKey,
  query: graphql`
    query srcExampleQuery {
      viewer {
        id
      }
    }
  `,
  variables: () => ({}),
  mapResponse: (data) => {
    return data.example;
  }
});

export const exampleSelector = selector({
  key: 'exampleSelector',
  get: async ({ get }) => {
    return get(exampleGraphQLSelector);
  }
});

// --------| Pinned Datasets State |--------

export const pinnedDatasets = graphQLSelector({
  key: 'pinnedDatasets',
  environment: recoilEnvironmentKey,
  query: DatasetsPinnedQuery,
  variables: () => ({}),
  mapResponse: ({ datasets }) => datasets
});

// Temporary workaround for force updating connection cache elsewhere
// todo: need to find an approach to avoid manual cache invalidation @ibrahim
export const pinnedDatasetsConnectionRefresherState = atom({
  key: 'pinnedDatasetsConnectionRefresher',
  default: null
});

// ---------| Get Dataset State |----------
// don't use this directly. use custom hooks
export const currentDatasetState = graphQLSelectorFamily({
  key: 'currentDataset',
  environment: recoilEnvironmentKey,
  query: datasetBySlugQuery,
  variables: (slug: string) => () => {
    if (!slug || slug.length < 1) {
      return null;
    }

    return { identifier: slug };
  },
  mapResponse: (data: DatasetGetBySlugQuery.DatasetBySlugQuery$data) => {
    return data.dataset;
  },
  default: null
});

// use custom hooks
export const useCurrentDataset = (slug: string) =>
  useRecoilValue(currentDatasetState(slug));

export const isEditingDatasetName = atom({
  key: 'isEditingDatasetName',
  default: false
});

export const useIsEditingDatasetName = (): [
  boolean,
  SetterOrUpdater<boolean>
] => [
  useRecoilValue(isEditingDatasetName),
  useSetRecoilState(isEditingDatasetName)
];

export const datasetsByTagSuggestions = graphQLSelector({
  key: 'datasetsByTagSuggestions',
  environment: recoilEnvironmentKey,
  query: SearchByTagQuery.default,
  variables: ({ get }) => {
    const tagSearchTerm = get(datasetTagSearchTermState);

    return {
      searchTerm: tagSearchTerm || '',
      first: 10
    };
  },
  mapResponse: (data: SearchByTagQuery.SearchDatasetTagsQuery$data) => {
    // TODO:MANI api is returning duplicates. fix api

    const tagSet = new Set();
    const res = data?.search
      .map((sr) => {
        if (sr.__typename === 'Tag' && !tagSet.has(sr.text)) {
          tagSet.add(sr.text);
          return { value: sr.text, label: sr.text };
        }
      })
      .filter((tag) => !!tag);

    return res as { value: string; label: string }[];
  },
  default: []
});

export * from './clientEnvironments';
export { recoilEnvironmentKey } from './Common/recoil-env';

export {
  initialQuery as InitialQuery,
  SearchSuggestionResult,
  createdByUserState,
  datasetListPageInfoState,
  datasetListSortState,
  datasetSearchTermState,
  datasetsConnectionFragment,
  datasetsCountFragment,
  datasetsRootQuery,
  datasetsV2ConnectionFragment,
  isSearchOrFiltersSelector,
  mediaTypeState,
  searchHelpTextSelector,
  searchInputState,
  searchSuggestions,
  searchTermState,
  setDatasetPinnedMutation,
  toSearchFilter,
  updateDatasetViewLastLoadedAtMutation
} from './Datasets';

export * as CONSTANT_VARIABLES from './constants';
export {
  DatasetCreateDatasetMutation,
  DatasetSlugQuery,
  DatasetUpdateMutation
} from './Dataset';

// ---------| Manage Dataset State |----------

export * from './Dataset/history';
export * from './Dataset/manage';
export * from './Dataset/runs';

// --------| Settings State |--------
// todo: need to find a way to avoid re-exporting

export * from './Common';
export * from './Dataset';
export * from './layout';
export * from './Notification';
export * from './Organization';
export * from './Settings';
export * from './User';
export * from './Workflows';

// --------| Layout/Footer |--------

const footer = atom({ key: 'footer', default: { enabled: true } });
export function useFooter() {
  const [state, setState] = useRecoilState(footer);
  return {
    ...state,
    disable() {
      setState((s) => ({ ...s, enabled: false }));
    }
  };
}

// --------| Queries |--------

export * from './Queries';
