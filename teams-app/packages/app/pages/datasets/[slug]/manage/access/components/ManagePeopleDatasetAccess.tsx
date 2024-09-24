// External Libraries
import { useEffect } from "react";
import { useRecoilState } from "recoil";
import { useRouter } from "next/router";
import { useLazyLoadQuery } from "react-relay/hooks";

// FiftyOne Components
import { Box, EmptyState } from "@fiftyone/teams-components";

// FiftyOne State and Mutations
import {
  manageAccessItemsState,
  ManageDatasetAccessTarget,
  manageDatasetGetAccessPageQuery,
  manageDatasetGetAccessPageQueryT,
  manageDatasetGetAccessPageState,
} from "@fiftyone/teams-state";

// Local Components
import DatasetAccessTable from "./DatasetAccessTable";

export default function ManagePeopleDatasetAccess() {
  const router = useRouter();
  const { slug: datasetIdentifier } = router.query;
  const [_, setFinalItems] = useRecoilState(manageAccessItemsState);
  const [{ page, pageSize }] = useRecoilState(manageDatasetGetAccessPageState);

  const result = useLazyLoadQuery<manageDatasetGetAccessPageQueryT>(
    manageDatasetGetAccessPageQuery,
    { datasetIdentifier: datasetIdentifier as string, page, pageSize },
    { fetchPolicy: "store-and-network" }
  );
  const targets = result?.dataset?.accessPage?.nodes || [];
  const pageTotal: number = result?.dataset?.accessPage?.pageTotal || 0;

  useEffect(() => {
    if (targets) {
      setFinalItems((targets as ManageDatasetAccessTarget[]) || []);
    }
  }, [targets]);

  return (
    <Box>
      {Boolean(targets?.length) && <DatasetAccessTable total={pageTotal} />}
      {!Boolean(targets?.length) && (
        <EmptyState resource="people and groups with special access" />
      )}
    </Box>
  );
}
