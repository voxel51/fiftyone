import {
  useMutation,
  usePaginationFragment,
  usePreloadedQuery,
  useRefetchableFragment,
} from "react-relay";
import { useRecoilValue } from "recoil";
import numeral from "numeral";

import {
  CONSTANT_VARIABLES,
  datasetsConnectionFragment,
  datasetsCountFragment,
  datasetsRootQuery,
  lastPinToggledDatasetState,
} from "@fiftyone/teams-state";

import {
  Box,
  Divider,
  Grid,
  Link,
  List,
  ListItem,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import { PinnedDatasetRow } from "./row";

const { PINNED_DATASET_LOAD_MORE_LIMIT } = CONSTANT_VARIABLES;
import { useEffect } from "react";

// todo: move all hard-coded text to constant @Ibrahim
export default function PinnedDatasets({ queryRef }) {
  const theme = useTheme();

  const fragments = usePreloadedQuery(datasetsRootQuery, queryRef);
  const { data, refetch, loadNext } = usePaginationFragment(
    datasetsConnectionFragment,
    fragments
  );
  const pinnedDatasets = data?.datasetsConnection?.edges.map(
    ({ node }) => node
  );

  const [datasetsCountResponse, refetchCount] = useRefetchableFragment(
    datasetsCountFragment,
    fragments
  );

  const lastPinToggledDataset = useRecoilValue(lastPinToggledDatasetState);

  let datasetsCount = datasetsCountResponse?.datasetsCount;
  const hiddenPinnedDatasetsCount = datasetsCount - pinnedDatasets.length;

  useEffect(() => {
    if (lastPinToggledDataset) {
      refetch({}, { fetchPolicy: "store-and-network" });
      refetchCount({}, { fetchPolicy: "store-and-network" });
    }
  }, [lastPinToggledDataset]);

  return (
    <Grid width="100%" pt={2}>
      <Box paddingTop={2}>
        <Typography variant="body2" fontWeight="semiBold" paddingBottom={2}>
          Your pinned datasets
        </Typography>
        <Divider />
        {pinnedDatasets.length === 0 && (
          <Typography variant="body1" fontWeight="medium" paddingTop={2}>
            No pinned datasets
          </Typography>
        )}
        <List dense={true}>
          {pinnedDatasets.map((n, index) => (
            <PinnedDatasetRow ds={n} key={index} />
          ))}
          {hiddenPinnedDatasetsCount > 0 && (
            <ListItem>
              <Link
                component="button"
                variant="body1"
                onClick={() => {
                  loadNext(PINNED_DATASET_LOAD_MORE_LIMIT);
                }}
              >
                {`+${hiddenPinnedDatasetsCount} more...`}
              </Link>
            </ListItem>
          )}
        </List>
      </Box>
    </Grid>
  );
}
