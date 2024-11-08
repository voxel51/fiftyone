import {
  useCurrentOrganization,
  useCurrentUser,
  useUserRole,
  withPermissions,
} from "@fiftyone/hooks";
import {
  Box,
  Dialog,
  SectionHeader,
  SettingsLayout,
  TableSkeleton,
  UserAccessOverviewCard,
  UsersTable,
} from "@fiftyone/teams-components";
import {
  MANAGE_ORGANIZATION,
  mainTitleSelector,
  settingsTeamInviteTeammateOpen,
  settingsTeamSelectedUserId,
  teamUsersListQuery,
  userListInvitationsCountState,
  userListPageInfoState,
  userListSortState,
  userListUsersCountState,
  userSearchTermState,
} from "@fiftyone/teams-state";
import { LEARN_MORE_ABOUT_ROLES_LINK } from "@fiftyone/teams-state/src/constants";
import { Add as AddIcon } from "@mui/icons-material";
import { Button, Tab, Tabs } from "@mui/material";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useQueryLoader } from "react-relay";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import UserListFilterBar from "../components/UserFilter/UserListFilterBar";
import InvitationsTable from "./components/InvitationsTable";
import InviteTeammate from "./components/InviteTeammate";
import RemoveTeammate from "./components/RemoveTeammate";

const TABS = { USERS: "users", INVITATIONS: "invitations" };
type TabType = "users" | "invitations";

function TeamUsers() {
  const [selectedUser, setSelectedUser] = useRecoilState(
    settingsTeamSelectedUserId
  );
  const setPageTitle = useSetRecoilState(mainTitleSelector);
  useEffect(() => {
    setPageTitle("Settings");
  }, [setPageTitle]);

  const [pageInfo, setPageInfo] = useRecoilState(userListPageInfoState);
  const search = useRecoilValue(userSearchTermState);
  const sort = useRecoilValue(userListSortState);

  const [inviteOpen, setInviteTeammateOpen] = useRecoilState(
    settingsTeamInviteTeammateOpen
  );

  const currentOrganization = useCurrentOrganization();
  const organizationDisplayName = currentOrganization?.displayName;

  const canFilterUsers = useCurrentUser()[0]?.role === "ADMIN";
  const userListUsersCount = useRecoilValue(userListUsersCountState);
  const userListInvitationsCount = useRecoilValue(
    userListInvitationsCountState
  );

  const { canInvite } = useUserRole();
  const [tab, setTab] = useState<TabType>("users");

  const showInvitation = tab === TABS.INVITATIONS && canInvite;
  const showUsers = tab === TABS.USERS;

  const invitationBtn = useMemo(
    () => (
      <Button
        startIcon={<AddIcon />}
        onClick={() => {
          setInviteTeammateOpen(true);
        }}
        variant="contained"
      >
        Invite people
      </Button>
    ),
    [setInviteTeammateOpen]
  );

  const [queryRef, loadQuery] = useQueryLoader(teamUsersListQuery);
  const variables = useMemo(
    () => ({
      page: pageInfo.page,
      pageSize: pageInfo.pageSize,
      search,
      order: { field: sort.field, direction: sort.direction },
    }),
    [pageInfo, search, sort]
  );

  const refetch = useCallback(() => {
    loadQuery(variables, { fetchPolicy: "store-and-network" });
  }, [loadQuery, variables]);

  useEffect(() => {
    loadQuery(variables, { fetchPolicy: "store-and-network" });
  }, [loadQuery, variables]);

  const usersCountText = useMemo(() => {
    if (userListUsersCount !== 1) {
      return "This person has";
    } else {
      return `These ${userListUsersCount} people have`;
    }
  }, [userListUsersCount]);

  const invitationsCountText = userListInvitationsCount
    ? `${userListInvitationsCount} `
    : "";

  return (
    <SettingsLayout>
      <Box>
        <Tabs
          value={tab}
          onChange={(_, val: string) => setTab(val as TabType)}
          aria-label="Team users tabs"
          sx={{ mb: 2 }}
        >
          <Tab label="Team" value={"users"} />
          {canInvite && <Tab label="Invitations" value={"invitations"} />}
        </Tabs>
        {showUsers && (
          <>
            <SectionHeader
              title={""}
              description={`${usersCountText} read access to one or more datasets.`}
              learnMoreLink={LEARN_MORE_ABOUT_ROLES_LINK}
              learnMoreText="Learn more about roles and permissions"
            >
              {canInvite ? invitationBtn : undefined}
            </SectionHeader>
            {canFilterUsers && <UserListFilterBar />}
            {!queryRef && <TableSkeleton rows={pageInfo.pageSize} />}
            {queryRef && (
              <Suspense fallback={<TableSkeleton rows={pageInfo.pageSize} />}>
                <UsersTable
                  queryRef={queryRef}
                  refetch={refetch}
                  onPageChange={(page: number) => {
                    setPageInfo({ ...pageInfo, page });
                  }}
                  onPageSizeChange={(pageSize: number) => {
                    setPageInfo({ ...pageInfo, pageSize });
                  }}
                  {...pageInfo}
                />
              </Suspense>
            )}
          </>
        )}
        {showInvitation && (
          <>
            <SectionHeader
              title=""
              description={`These ${invitationsCountText}people have been invited to join
                ${organizationDisplayName}, but have not yet accepted.`}
            >
              {canInvite ? invitationBtn : undefined}
            </SectionHeader>
            <InvitationsTable />
          </>
        )}
        {canInvite && inviteOpen && <InviteTeammate />}
        <Dialog
          fullWidth
          hideActionButtons
          open={selectedUser !== ""}
          onClose={() => {
            setSelectedUser("");
          }}
        >
          <UserAccessOverviewCard />
        </Dialog>
        <RemoveTeammate />
      </Box>
    </SettingsLayout>
  );
}

export default withPermissions(TeamUsers, [MANAGE_ORGANIZATION], "user", {
  getLayoutProps: () => ({ topNavProps: { noBorder: true } }),
});

export { getServerSideProps } from "lib/env";
