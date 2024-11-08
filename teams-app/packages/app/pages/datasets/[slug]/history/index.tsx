import {
  useCacheStore,
  useCurrentDataset,
  useCurrentDatasetPermission,
  withPermissions,
} from "@fiftyone/hooks";
import { Box } from "@fiftyone/teams-components";
import {
  CREATE_DATASET_SNAPSHOT,
  Dataset,
  SNAPSHOT_BANNER_QUERY_CACHE_KEY,
  VIEW_DATASET,
  historySnapshotsQuery,
  snapshotsPageState,
} from "@fiftyone/teams-state";
import { Stack } from "@mui/material";
import withRelay from "lib/withRelay";
import DatasetNavigation from "../components/navigation";
import CreateSnapshot from "./components/CreateSnapshot";
import PreviousSnapshots from "./components/PreviousSnapshots";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from "@fiftyone/teams-state/src/constants";
import { useRecoilValue } from "recoil";
import { useQueryLoader } from "react-relay";
import { useCallback, useEffect } from "react";

function History(props) {
  const { preloadedQuery } = props;
  const pageState = useRecoilValue(snapshotsPageState);
  const [queryRef, loadQuery] = useQueryLoader(
    historySnapshotsQuery,
    preloadedQuery
  );
  const { name } = useCurrentDataset() as Dataset;
  const fetchSnapshots = useCallback(() => {
    loadQuery(
      { slug: name, ...pageState },
      { fetchPolicy: "store-and-network" }
    );
  }, [loadQuery, name, pageState]);
  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);
  const canCreateSnapshot = useCurrentDatasetPermission([
    CREATE_DATASET_SNAPSHOT,
  ]);
  const [_, setStale] = useCacheStore(SNAPSHOT_BANNER_QUERY_CACHE_KEY);
  const refresh = useCallback(() => {
    setStale(true);
    fetchSnapshots();
  }, [fetchSnapshots, setStale]);

  return (
    <Box>
      <Box>
        <DatasetNavigation />
      </Box>
      <Stack spacing={4} pt={4} px={8}>
        {canCreateSnapshot && (
          <CreateSnapshot queryRef={queryRef} refresh={refresh} />
        )}
        <PreviousSnapshots queryRef={queryRef} refresh={refresh} />
      </Stack>
    </Box>
  );
}
export default withRelay(
  withPermissions(History, [VIEW_DATASET], "dataset"),
  historySnapshotsQuery,
  { getLayoutProps: () => ({ topNavProps: { noBorder: true } }) },
  { pageSize: DEFAULT_PAGE_SIZE, page: DEFAULT_PAGE }
);
