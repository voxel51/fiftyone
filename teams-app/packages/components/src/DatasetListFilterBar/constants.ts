import { DatasetOrderFieldsOrder } from '@fiftyone/teams-state/src/Datasets/__generated__/DatasetsListQuery.graphql';

export interface sortOptionType extends DatasetOrderFieldsOrder {
  displayName: string;
}

export const SORT_OPTIONS: sortOptionType[] = [
  {
    field: 'createdAt',
    direction: 'DESC',
    displayName: 'Newest'
  },
  {
    field: 'createdAt',
    direction: 'ASC',
    displayName: 'Oldest'
  },
  {
    field: 'name',
    direction: 'ASC',
    displayName: 'Name A-Z'
  },
  {
    field: 'name',
    direction: 'DESC',
    displayName: 'Name Z-A'
  },
  {
    field: 'lastLoadedAt',
    direction: 'DESC',
    displayName: 'Recently opened'
  },
  {
    field: 'samplesCount',
    direction: 'DESC',
    displayName: 'Most samples'
  },
  {
    field: 'samplesCount',
    direction: 'ASC',
    displayName: 'Fewest samples'
  },
  {
    field: 'sampleFieldsCount',
    direction: 'DESC',
    displayName: 'Most fields'
  },
  {
    field: 'sampleFieldsCount',
    direction: 'ASC',
    displayName: 'Fewest fields'
  }
];
