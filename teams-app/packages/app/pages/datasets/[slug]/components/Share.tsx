import {
  useCurrentDatasetPermission,
  useCurrentOrganization,
  useCurrentUserPermission,
  useLazyLoadLatestQuery,
} from "@fiftyone/hooks";
import {
  Box,
  Bubbles,
  Dialog,
  InputDatasetURL,
} from "@fiftyone/teams-components";
import {
  CONSTANT_VARIABLES,
  DATASET_SHARE_MODAL_GROUP_COUNT_CACHE_KEY,
  DATASET_SHARE_MODAL_INFO_CACHE_KEY,
  DatasetPermission,
  DatasetShareInfoQuery,
  DatasetShareInfoQueryT,
  INVITE_PEOPLE_TO_DATASET,
  VIEW_SHARE_MODAL_ACCESS_INFO,
  formatPermission,
  manageDatasetGetGroupsCountQuery,
  manageDatasetGetGroupsCountQueryT,
  manageDatasetGrantGroupAccessOpenState,
  manageDatasetGrantUserAccessOpenState,
  shareDatasetOpen,
} from "@fiftyone/teams-state";
import { formatListWithCount } from "@fiftyone/teams-utilities";
import { GroupAddOutlined } from "@mui/icons-material";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import { Button, List, ListItem, Skeleton, Typography } from "@mui/material";
import NextLink from "next/link";
import { useRouter } from "next/router";
import { Suspense, useMemo } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";

const { MEMBER_AVATARS_TO_SHOW_COUNT } = CONSTANT_VARIABLES;

export default function ShareDataset() {
  const [open, setOpen] = useRecoilState(shareDatasetOpen);
  const canViewShareModalAccessInfo = useCurrentUserPermission([
    VIEW_SHARE_MODAL_ACCESS_INFO,
  ]);

  return (
    <Dialog
      title="Share a link"
      open={open}
      onClose={() => {
        setOpen(false);
      }}
      hideActionButtons
      fullWidth
    >
      <InputDatasetURL setOpen={setOpen} />
      {canViewShareModalAccessInfo && (
        <Suspense fallback={<Skeleton height={64} sx={{ my: 1 }} />}>
          <DatasetAccessInfo
            onGrantAccess={() => {
              setOpen(false);
            }}
          />
        </Suspense>
      )}
    </Dialog>
  );
}

type DatasetAccessInfoProps = {
  onGrantAccess: (event: any) => {};
};

function DatasetAccessInfo(props: DatasetAccessInfoProps) {
  const { onGrantAccess } = props;
  const router = useRouter();
  const { slug: datasetIdentifier } = router.query;

  const datasetShareInfo = useLazyLoadLatestQuery<DatasetShareInfoQueryT>(
    DatasetShareInfoQuery,
    {
      identifier: datasetIdentifier as string,
      usersLimit: MEMBER_AVATARS_TO_SHOW_COUNT,
    },
    { cacheKey: DATASET_SHARE_MODAL_INFO_CACHE_KEY }
  );

  const groupsWithSepcialAccessInfo =
    useLazyLoadLatestQuery<manageDatasetGetGroupsCountQueryT>(
      manageDatasetGetGroupsCountQuery,
      {
        identifier: datasetIdentifier as string,
      },
      { cacheKey: DATASET_SHARE_MODAL_GROUP_COUNT_CACHE_KEY }
    );

  const groupsCount =
    groupsWithSepcialAccessInfo?.dataset?.userGroupsCount || 0;

  const setGrantUserAccessOpen = useSetRecoilState(
    manageDatasetGrantUserAccessOpenState
  );
  const setGrantGroupAccessOpen = useSetRecoilState(
    manageDatasetGrantGroupAccessOpenState
  );

  const canInvite = useCurrentDatasetPermission([INVITE_PEOPLE_TO_DATASET]);
  const currentOrganization = useCurrentOrganization();

  const {
    defaultPermission,
    guestCount = 0,
    collaboratorCount = 0,
    users = [],
    usersCount = 0,
    usersWithSpecialAccessCount = 0,
  } = datasetShareInfo?.dataset || {};

  const memberItems = useMemo(() => {
    return users.map((member) => ({
      title: member?.user?.name,
      id: member?.user?.id,
      picture: member?.user?.picture,
    }));
  }, [users]);

  const showMemberAccessTitle = usersCount > 0;
  const memberAccessTitle =
    usersCount === 1
      ? `1 person has access`
      : `${usersCount} people have access`;
  const organizationDisplayName = currentOrganization?.displayName;
  const hiddenItemsCount = Math.max(
    usersCount - MEMBER_AVATARS_TO_SHOW_COUNT,
    0
  );
  const specialAccessInfo = useMemo(() => {
    const memberCount =
      usersWithSpecialAccessCount - guestCount - collaboratorCount;
    const items = [];
    if (groupsCount > 0) items.push({ label: "group", amount: groupsCount });
    if (memberCount > 0) items.push({ label: "member", amount: memberCount });
    if (guestCount > 0) items.push({ label: "guest", amount: guestCount });
    if (collaboratorCount > 0)
      items.push({ label: "collaborator", amount: collaboratorCount });
    return formatListWithCount(items);
  }, [usersWithSpecialAccessCount, guestCount, collaboratorCount, groupsCount]);

  return (
    <Box>
      {showMemberAccessTitle && (
        <Box>
          <Box width="100%" pt={3} display="flex" flexDirection="column">
            <Typography variant="h6" fontSize={18} fontWeight="medium">
              {memberAccessTitle}
            </Typography>
            <Box display="flex" width="100%" paddingTop={1} minHeight={40}>
              <Bubbles
                items={memberItems}
                showHiddenItemsInTooltip={false}
                hiddenItemsCount={hiddenItemsCount}
              />
            </Box>
          </Box>
          <Box mt={4}>
            <List
              sx={{
                "& li": {
                  display: "list-item",
                  p: 0,
                  ml: 3,
                  listStyleType: "disc",
                },
              }}
            >
              <ListItem>
                <Typography component="div" display="inline">
                  <Box fontWeight="medium" display="inline">
                    All admins at {organizationDisplayName}{" "}
                  </Box>{" "}
                  can manage this dataset
                </Typography>
              </ListItem>
              {defaultPermission !== "NO_ACCESS" && (
                <ListItem>
                  <Typography component="div" display="inline">
                    <Box fontWeight="medium" display="inline">
                      All members at {organizationDisplayName}{" "}
                    </Box>{" "}
                    can{" "}
                    {formatPermission(defaultPermission as DatasetPermission)}{" "}
                    this dataset
                  </Typography>
                </ListItem>
              )}
              {usersWithSpecialAccessCount > 0 && (
                <ListItem>
                  <Typography component="div" display="inline">
                    <Box fontWeight="medium" display="inline">
                      {specialAccessInfo}
                    </Box>{" "}
                    also {usersWithSpecialAccessCount === 1 ? "has" : "have"}{" "}
                    special access
                  </Typography>
                </ListItem>
              )}
            </List>
          </Box>
        </Box>
      )}
      <Box display="flex" mt={4} width="100%">
        <NextLink
          href={`/datasets/${datasetIdentifier}/manage/access`}
          passHref
        >
          <Button
            variant="contained"
            fullWidth
            disabled={!canInvite}
            sx={{ mr: 3 }}
            onClick={(e) => {
              onGrantAccess(e);
              setGrantUserAccessOpen(true);
            }}
          >
            <PersonAddOutlinedIcon sx={{ fontSize: 18, mr: 0.75 }} /> Add User
          </Button>
        </NextLink>
        <NextLink
          href={`/datasets/${datasetIdentifier}/manage/access`}
          passHref
        >
          <Button
            variant="contained"
            fullWidth
            disabled={!canInvite}
            onClick={(e) => {
              onGrantAccess(e);
              setGrantGroupAccessOpen(true);
            }}
          >
            <GroupAddOutlined sx={{ fontSize: 18, mr: 0.75 }} /> Add Group
          </Button>
        </NextLink>
      </Box>
    </Box>
  );
}
