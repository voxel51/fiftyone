import * as state from '@fiftyone/teams-state';
import { useMemo } from 'react';
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil';

/**
 * Custom hook to be connected to the URL params as well
 * @param props
 * @returns
 */
const useDatasetsFilter = () => {
  const [{ page, pageSize }, setPageInfo] = useRecoilState(
    state.datasetListPageInfoState
  );
  const [{ field, direction }, setSort] = useRecoilState(
    state.datasetListSortState
  );
  const [searchTerm, setSearchTerm] = useRecoilState(
    state.datasetSearchTermState
  );
  const [newDataset, setNewDataset] = useRecoilState(state.newDatasetState);
  const resetNewDataset = useResetRecoilState(state.newDatasetState);
  const [mediaTypes, setMediaTypes] = useRecoilState(state.mediaTypeState);
  const [createdByUser, setCreatedByUser] = useRecoilState(
    state.createdByUserState
  );
  const resetCreatedByUser = useResetRecoilState(state.createdByUserState);
  const searchHelpText = useRecoilValue(state.searchHelpTextSelector);

  return useMemo(() => {
    return {
      createdByUser,
      setCreatedByUser,
      page,
      pageSize,
      setPageInfo,
      field,
      direction,
      setSort,
      searchTerm,
      setSearchTerm,
      newDataset,
      setNewDataset,
      resetNewDataset,
      mediaTypes,
      setMediaTypes,
      resetCreatedByUser,
      searchHelpText
    };
  }, [
    page,
    pageSize,
    setPageInfo,
    field,
    direction,
    setSort,
    searchTerm,
    setSearchTerm,
    newDataset,
    setNewDataset,
    resetNewDataset,
    mediaTypes,
    setMediaTypes,
    createdByUser,
    setCreatedByUser,
    resetCreatedByUser,
    searchHelpText
  ]);
};

export default useDatasetsFilter;
