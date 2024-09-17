import { Box, Table, TableBody } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  TableContainer,
  UsersTableRow,
  Pagination
} from '@fiftyone/teams-components';
import { usePreloadedQuery } from 'react-relay';
import {
  teamUsersListQuery,
  teamUsersListQueryT,
  userListUsersCountState
} from '@fiftyone/teams-state';
import { useEffect } from 'react';
import EmptyUsers from '../EmptyUsers';
import { useSetRecoilState } from 'recoil';
import { useUserAudit } from '@fiftyone/hooks';

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  datasetsCount: number;
};

type UsersTableProps = {
  users: Array<User>;
  pageTotal: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: number;
  queryRef: any;
};

export default function UsersTable({
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  queryRef
}: UsersTableProps) {
  const setUserListUsersCount = useSetRecoilState(userListUsersCountState);
  const { usersPage } = usePreloadedQuery<teamUsersListQueryT>(
    teamUsersListQuery,
    queryRef
  );
  const { nodes: users, pageTotal, nodeTotal } = usersPage;

  useEffect(() => {
    setUserListUsersCount(nodeTotal);
  }, [nodeTotal]);

  const theme = useTheme();

  const { getOpenRoles, refetch: refetchOpenRoles } = useUserAudit();

  if (!users.length) {
    return <EmptyUsers />;
  }

  return (
    <Box>
      <TableContainer
        sx={{
          border: '1px solid',
          borderColor: theme.palette.divider,
          borderRadius: 2
        }}
      >
        <Table>
          <TableBody>
            {users.map((user) => (
              <UsersTableRow
                getOpenRoles={getOpenRoles}
                refetchOpenRoles={refetchOpenRoles}
                key={user.id}
                {...user}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Pagination
        count={pageTotal}
        page={page}
        onChange={(_, page) => {
          onPageChange(page);
        }}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        onManualPageChange={onPageChange}
        disablePageSizeSelection // NOTE: helps with Auth0 rate limit until we improve caching
      />
    </Box>
  );
}
