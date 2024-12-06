import { CurrentUserFragment } from "@fiftyone/hooks";
import {
  DatasetList,
  DatasetListFilterBar,
  layout,
  NewDatasetButton,
  PinnedDatasets,
  RecentViews,
  TableSkeleton,
} from "@fiftyone/teams-components";
import { SORT_OPTIONS } from "@fiftyone/teams-components/src/DatasetListFilterBar/constants";
import {
  RECENT_VIEWS_DEFAULT_LIMIT,
  RecentViewsListFragment,
} from "@fiftyone/teams-components/src/RecentViews";
import {
  currentUser,
  CurrentUserFragment$keyT,
  CurrentUserFragmentQueryT,
  datasetsRootQuery,
  DatasetsV2RootQueryT,
  InitialQuery,
  mainTitleSelector,
  RecentViewsListFragment$keyT,
  RecentViewsListFragmentQueryT,
} from "@fiftyone/teams-state";
import {
  DEFAULT_LIST_PAGE_SIZE,
  INITIAL_PINNED_DATASETS_LIMIT,
  PINNED_DATASETS_ORDER_DIRECTION,
} from "@fiftyone/teams-state/src/constants";
import { Box } from "@mui/material";
import { Suspense, useEffect } from "react";
import {
  usePreloadedQuery,
  useQueryLoader,
  useRefetchableFragment,
} from "react-relay";
import { useSetRecoilState } from "recoil";
import { RelayProps } from "relay-nextjs";
import withRelay from "../../lib/withRelay";

function Datasets({ preloadedQuery }: RelayProps<{}, DatasetsV2RootQueryT>) {
  // TODO: move page title logic to a hook
  const setPageTitle = useSetRecoilState(mainTitleSelector);

  const result = usePreloadedQuery(InitialQuery, preloadedQuery);
  const [viewData] = useRefetchableFragment<
    RecentViewsListFragmentQueryT,
    RecentViewsListFragment$keyT
  >(RecentViewsListFragment, result);
  const [user] = useRefetchableFragment<
    CurrentUserFragmentQueryT,
    CurrentUserFragment$keyT
  >(CurrentUserFragment, result);
  const setCurrentUser = useSetRecoilState(currentUser);

  useEffect(() => {
    if (user) {
      setCurrentUser(user);
    }
  }, [user, setCurrentUser]);

  useEffect(() => {
    setPageTitle("All datasets");
  }, []);

  const [pinnedDatasetsQueryRef, loadPinnedDatasetsQuery] =
    useQueryLoader(datasetsRootQuery);

  useEffect(() => {
    loadPinnedDatasetsQuery({
      first: INITIAL_PINNED_DATASETS_LIMIT,
      filter: { userPinned: true },
      order: {
        field: "userPinnedAt",
        direction: PINNED_DATASETS_ORDER_DIRECTION,
      },
    });
  }, [loadPinnedDatasetsQuery]);

  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <layout.SidePanelLayout reverse>
        <Box pl={2}>
          <NewDatasetButton />
          {pinnedDatasetsQueryRef !== null && (
            <PinnedDatasets queryRef={pinnedDatasetsQueryRef} />
          )}
          <Suspense
            fallback={<TableSkeleton rows={RECENT_VIEWS_DEFAULT_LIMIT} />}
          >
            <RecentViews userViews={viewData.userViews} />
          </Suspense>
        </Box>
        <Box>
          <DatasetListFilterBar />
          <Suspense fallback={<TableSkeleton rows={DEFAULT_LIST_PAGE_SIZE} />}>
            <DatasetList
              preloadedQuery={preloadedQuery}
              InitialQuery={InitialQuery}
            />
          </Suspense>
        </Box>
      </layout.SidePanelLayout>
    </Suspense>
  );
}

export default withRelay(
  Datasets,
  InitialQuery,
  {},
  {
    page: 1,
    pageSize: DEFAULT_LIST_PAGE_SIZE,
    order: {
      field: SORT_OPTIONS[0].field,
      direction: SORT_OPTIONS[0].direction,
    },
  }
);
