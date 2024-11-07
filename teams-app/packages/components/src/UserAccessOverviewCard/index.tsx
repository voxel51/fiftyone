import { withSuspense } from "@fiftyone/hooks";
import {
  ManageUserDatasets,
  Pagination,
  SectionHeader,
  TableSkeleton,
  UserCard,
} from "@fiftyone/teams-components";
import {
  settingsTeamSelectedUserId,
  settingsTeamUserDatasetsByInvitePageState,
  settingsTeamUserDatasetsPageState,
  settingsTeamUserDatasetsUpdateCount,
  teamUserDatasetsPageQuery,
  teamUserQuery,
} from "@fiftyone/teams-state";
import { teamUserDatasetsPageQuery as teamUserDatasetsPageQueryType } from "@fiftyone/teams-state/src/Settings/__generated__/teamUserDatasetsPageQuery.graphql";
import { teamUserQuery as teamUserQueryType } from "@fiftyone/teams-state/src/Settings/__generated__/teamUserQuery.graphql";
import { DEFAULT_LIST_PAGE_SIZES } from "@fiftyone/teams-state/src/constants";
import { labelWithCount } from "@fiftyone/teams-utilities";
import { Alert, AlertTitle, Box, Typography } from "@mui/material";
import { Suspense, useEffect } from "react";
import { useLazyLoadQuery } from "react-relay";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";

function UserAccessOverviewCard() {
  const userId = useRecoilValue(settingsTeamSelectedUserId);
  const result = useLazyLoadQuery<teamUserQueryType>(teamUserQuery, { userId });
  const { id, datasetsCount, email, name, picture } = result?.user || {};

  return (
    <Box>
      <UserCard detailed name={name} email={email} src={picture} id={id} />
      <Typography paddingTop={2}>
        {name} has access to {labelWithCount(datasetsCount, "dataset")}.
        {/* {' '}<Link href={DATASET_PERMISSION_LINK}>
          Learn more about dataset permission in FiftyOne
        </Link>
        . */}
      </Typography>
      <Suspense fallback={<LoadingComponent />}>
        <ManageUserDatasetsSection name={name} byInviteOnly userId={userId} />
      </Suspense>
      <Suspense fallback={<LoadingComponent />}>
        <ManageUserDatasetsSection name={name} userId={userId} />
      </Suspense>
    </Box>
  );
}

type ManageUserDatasetsContainerProps = {
  byInviteOnly?: boolean;
  name: string;
  userId: string;
};

function ManageUserDatasetsSection(props: ManageUserDatasetsContainerProps) {
  const { byInviteOnly, name, userId } = props;
  const pageRecoilState = byInviteOnly
    ? settingsTeamUserDatasetsByInvitePageState
    : settingsTeamUserDatasetsPageState;
  const [pageState, setPageState] = useRecoilState(pageRecoilState);
  const resetPageState = useResetRecoilState(pageRecoilState);
  const updateCount = useRecoilValue(settingsTeamUserDatasetsUpdateCount);
  const filter = byInviteOnly
    ? { userPermission: { ne: null } }
    : { userPermission: { eq: null } };
  const result = useLazyLoadQuery<teamUserDatasetsPageQueryType>(
    teamUserDatasetsPageQuery,
    { userId, ...pageState, filter },
    { fetchPolicy: "store-and-network", fetchKey: updateCount }
  );
  const datasetsPage = result?.user?.datasetsPage;
  const { nodes: datasets = [], pageTotal } = datasetsPage || {};
  const formattedDatasets = datasets.map(
    ({ id, name, samplesCount, user }) => ({
      id,
      name,
      samplesCount,
      permission: byInviteOnly ? user?.userPermission : user?.activePermission,
    })
  );
  const title = byInviteOnly ? "By invitation" : "As a member";

  useEffect(() => resetPageState, []);

  if (datasets.length === 0) return null;

  return (
    <>
      <SectionHeader title={title} sx={{ paddingTop: 2 }} />
      {!byInviteOnly && (
        <Alert severity="info">
          <AlertTitle>These datasets are visible to all members</AlertTitle>
          <Typography>
            Change {name}'s role to remove them from these datasets
          </Typography>
        </Alert>
      )}
      <ManageUserDatasets
        datasets={formattedDatasets}
        readOnly={!byInviteOnly}
      />
      <Pagination
        containerProps={{ pt: 2 }}
        count={pageTotal}
        page={pageState.page || 1}
        onChange={(e, page) => {
          setPageState({ ...pageState, page });
        }}
        pageSize={pageState.pageSize}
        onPageSizeChange={(pageSize) => {
          setPageState((pageState) => ({ ...pageState, pageSize }));
        }}
        onManualPageChange={(page) => {
          setPageState((pageState) => ({ ...pageState, page }));
        }}
        availablePageSizes={["3", ...DEFAULT_LIST_PAGE_SIZES]}
      />
    </>
  );
}

function LoadingComponent() {
  return <TableSkeleton containerProps={{ sx: { pt: 2 } }} />;
}

export default withSuspense(UserAccessOverviewCard, LoadingComponent);
