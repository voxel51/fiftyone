import * as state from "@fiftyone/teams-state";
import { useMemo } from "react";
import { useRecoilState } from "recoil";

/**
 * Custom hook to be connected to the URL params as well
 * @param props
 * @returns
 */
const useUsersSearch = () => {
  const [{ page, pageSize }, setPageInfo] = useRecoilState(
    state.userListPageInfoState
  );
  const [{ field, direction }, setSort] = useRecoilState(
    state.userListSortState
  );
  return useMemo(() => {
    return {
      page,
      pageSize,
      setPageInfo,
      field,
      direction,
      setSort,
    };
  }, [page, pageSize, setPageInfo, field, direction, setSort]);
};

export default useUsersSearch;
