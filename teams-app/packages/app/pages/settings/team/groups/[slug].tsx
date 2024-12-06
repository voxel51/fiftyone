import {
  useAddUsersToGroup,
  useRemoveUsersFromGroup,
  withPermissions,
} from "@fiftyone/hooks";
import {
  Box,
  EmptyState,
  Pagination,
  SectionHeader,
  SettingsLayout,
  TableContainer,
  UserGroupModal,
  WithTooltip,
} from "@fiftyone/teams-components";
import {
  Group,
  GroupUserFrag,
  MANAGE_ORGANIZATION,
  currentUserGroup,
  groupInModalState,
  groupUsersPageInfo,
  groupUsersQuery,
  mainTitleSelector,
  multiUserSearchSelectModalOpenState,
} from "@fiftyone/teams-state";
import {
  Breadcrumbs,
  Button,
  IconButton,
  Table,
  TableBody,
  Typography,
} from "@mui/material";
import { useEffect } from "react";
import { useFragment } from "react-relay";
import { useSetRecoilState } from "recoil";
import { RelayProps } from "relay-nextjs";

import { Add } from "@mui/icons-material";
import withRelay from "lib/withRelay";

import { groupUsersQueryT } from "@fiftyone/teams-state";
import EditIcon from "@mui/icons-material/Edit";

import { groupUsersFragment$key } from "@fiftyone/teams-state/src/Settings/__generated__/groupUsersFragment.graphql";
import { groupUsersQuery as GroupUsersQuery } from "@fiftyone/teams-state/src/Settings/__generated__/groupUsersQuery.graphql";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  FEATURE_FLAG_ENABLE_MANUAL_USER_GROUP_MANAGEMENT_ENV_KEY,
  MANUAL_GROUP_MGMT_DISABLED_TEXT,
} from "@fiftyone/teams-state/src/constants";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import Link from "next/link";
import ManageUser from "pages/datasets/[slug]/manage/access/components/ManageUser";
import { usePreloadedQuery } from "react-relay";
import { useRecoilState } from "recoil";
import MultiUserSearchSelectModal from "./components/MultiUserSearchSelectModal";
import { useBooleanEnv } from "@fiftyone/hooks/src/common/useEnv";

const UserRow = ({
  frag,
  readOnly = false,
}: {
  frag: groupUsersFragment$key;
  readOnly?: boolean;
}) => {
  const user = useFragment(GroupUserFrag, frag);
  const { removeUsersFromGroup } = useRemoveUsersFromGroup();
  if (!user) return null;

  return (
    <ManageUser
      key={user.id}
      target={user}
      onDelete={() => {
        removeUsersFromGroup([user.id]);
      }}
      readOnly={readOnly}
    />
  );
};

function GroupUsers({ preloadedQuery }: RelayProps<{}, GroupUsersQuery>) {
  const enableManualGroupMgmt = useBooleanEnv(
    FEATURE_FLAG_ENABLE_MANUAL_USER_GROUP_MANAGEMENT_ENV_KEY,
    true
  );
  const setPageTitle = useSetRecoilState(mainTitleSelector);
  useEffect(() => {
    setPageTitle("Settings");
  }, [setPageTitle]);

  const { userGroup } = usePreloadedQuery<groupUsersQueryT>(
    groupUsersQuery,
    preloadedQuery
  );
  const { usersCount } = userGroup || {};
  const showEmptyPage = !Boolean(usersCount);
  const [open, setOpen] = useRecoilState(multiUserSearchSelectModalOpenState);
  const setGroup = useSetRecoilState(currentUserGroup);
  const { addUsersToGroup, isAddingUsersToGroup } = useAddUsersToGroup();
  const [pageInfo, setPageInfo] = useRecoilState(groupUsersPageInfo);
  const setGroupInModal = useSetRecoilState(groupInModalState);

  useEffect(() => {
    if (userGroup) {
      setGroup(userGroup);
    }
  }, [userGroup, setGroup]);

  return (
    <SettingsLayout>
      <SectionHeader
        title={
          <Breadcrumbs
            sx={{
              pb: 1,
              li: {
                maxWidth: "70%",
                height: 30,
                display: "flex",
                alignItems: "center",
              },
            }}
            separator={
              <ArrowForwardIosIcon fontSize="small" sx={{ mt: ".5rem" }} />
            }
          >
            <Typography
              variant="h5"
              fontWeight="bolder"
              sx={{
                cursor: "pointer",
                "&:hover": { color: (theme) => theme.palette.text.primary },
              }}
            >
              <Link href="/settings/team/groups">All groups</Link>
            </Typography>
            <Box display="flex" width="100%">
              <Typography
                variant="h5"
                sx={{
                  color: (theme) => theme.palette.text.primary,
                  position: "relative",
                }}
                noWrap
              >
                {userGroup?.name || "No name"}
              </Typography>
              <WithTooltip
                disabled={!enableManualGroupMgmt}
                text={MANUAL_GROUP_MGMT_DISABLED_TEXT}
              >
                <IconButton
                  size="small"
                  title={"Edit group info"}
                  sx={{
                    background: (theme) => theme.palette.background.secondary,
                    ml: 1,
                  }}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setGroupInModal(userGroup as Group);
                  }}
                  disabled={!enableManualGroupMgmt}
                >
                  <EditIcon />
                </IconButton>
              </WithTooltip>
            </Box>
          </Breadcrumbs>
        }
        description={
          <Typography
            variant="h5"
            sx={{
              color: (theme) => theme.palette.text.secondary,
              position: "relative",
            }}
            fontSize="1.2rem"
            noWrap
          >
            {userGroup?.description || ""}
          </Typography>
        }
      >
        <WithTooltip
          disabled={!enableManualGroupMgmt}
          text={MANUAL_GROUP_MGMT_DISABLED_TEXT}
        >
          <Button
            onClick={() => {
              setOpen(true);
            }}
            variant="contained"
            disabled={!enableManualGroupMgmt}
          >
            <Add sx={{ mr: 1, fontSize: "1.5rem" }} />
            Add users
          </Button>
        </WithTooltip>
      </SectionHeader>
      {showEmptyPage && <EmptyState resource="users" />}
      {!showEmptyPage && (
        <>
          <TableContainer
            sx={{
              border: (theme) => `1px solid ${theme.palette.divider}`,
              borderRadius: 2,
            }}
          >
            <Table>
              <TableBody>
                {userGroup?.usersPage.nodes.map((frag, index) => {
                  return (
                    <UserRow
                      key={index}
                      frag={frag}
                      readOnly={!enableManualGroupMgmt}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Pagination
            count={userGroup?.usersPage?.pageTotal}
            page={pageInfo.page}
            pageSize={pageInfo.pageSize}
            onChange={(_, page) => {
              setPageInfo((state) => ({ ...state, page }));
            }}
            onPageSizeChange={(pageSize) => {
              setPageInfo((state) => ({ ...state, pageSize }));
            }}
            onManualPageChange={(page) => {
              setPageInfo((state) => ({ ...state, page }));
            }}
          />
        </>
      )}
      {open && (
        <MultiUserSearchSelectModal
          onSelectUsers={(userIds: string[]) => {
            addUsersToGroup(userIds, () => {
              setOpen(false);
            });
          }}
          loading={isAddingUsersToGroup}
        />
      )}
      <UserGroupModal />
    </SettingsLayout>
  );
}

export default withRelay(
  withPermissions(GroupUsers, [MANAGE_ORGANIZATION], "user"),
  groupUsersQuery,
  {},
  {
    page: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
  }
);
