import { Table, TableBody } from "@mui/material";
import {
  Box,
  TableContainer,
  EmptyState,
  TableSkeleton,
} from "@fiftyone/teams-components";
import InvitationsTableRow from "./InvitationsTableRow";
import { useRecoilValueLoadable, useSetRecoilState } from "recoil";
import {
  teamInvitationsSelector,
  userListInvitationsCountState,
} from "@fiftyone/teams-state";
import { DEFAULT_USERS_PAGE_SIZE } from "@fiftyone/teams-state/src/constants";
import { useEffect } from "react";

export default function InvitationsTable() {
  const { contents: invitations, state } = useRecoilValueLoadable(
    teamInvitationsSelector
  );
  const setUserListInvitationsCount = useSetRecoilState(
    userListInvitationsCountState
  );

  useEffect(() => {
    if (invitations?.length >= 0)
      setUserListInvitationsCount(invitations.length || null);
  }, [invitations, setUserListInvitationsCount]);

  if (state === "hasError") throw invitations;
  if (state === "loading") {
    return <TableSkeleton rows={DEFAULT_USERS_PAGE_SIZE} />;
  }

  return (
    <Box>
      {invitations.length === 0 && <EmptyState resource="invitations" />}
      {invitations.length > 0 && (
        <Box>
          <TableContainer
            sx={{
              border: "1px solid",
              borderColor: (theme) => theme.palette.divider,
              borderRadius: 2,
            }}
          >
            <Table>
              <TableBody>
                {invitations.map((invitation: any) => {
                  const {
                    inviteeEmail,
                    inviteeRole,
                    createdAt,
                    id,
                    expiresAt,
                    url,
                  } = invitation;
                  return (
                    <InvitationsTableRow
                      key={id}
                      url={url}
                      email={inviteeEmail}
                      id={id}
                      role={inviteeRole}
                      createdAt={createdAt}
                      expiresAt={expiresAt}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {/* Invitation are currently not paginated */}
          {/* <Pagination count={3} onChange={(e, page) => {}} /> */}
        </Box>
      )}
    </Box>
  );
}
