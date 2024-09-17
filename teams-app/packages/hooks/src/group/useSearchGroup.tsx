import * as state from '@fiftyone/teams-state';
import { useMemo } from 'react';
import { useRecoilState } from 'recoil';

/**
 * Custom hook to be connected to the URL params as well
 * @param props
 * @returns
 */
const useGroupsSearch = () => {
  const [{ page, pageSize }, setPageInfo] = useRecoilState(
    state.groupsListPageInfoState
  );
  const [{ field, direction }, setSort] = useRecoilState(
    state.groupListSortState
  );
  return useMemo(() => {
    return {
      page,
      pageSize,
      setPageInfo,
      field,
      direction,
      setSort
    };
  }, [page, pageSize, setPageInfo, field, direction, setSort]);
};

export default useGroupsSearch;
