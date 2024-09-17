import { useSetRecoilState } from 'recoil';
import {
  settingsTeamSelectedUserId,
  teamRemoveTeammateOpenState,
  teamRemoveTeammateTargetState,
  teamSetUserRoleMutation
} from '@fiftyone/teams-state';
import { Button, TableCell, TableRow } from '@mui/material';
import { RemoveCircleOutline as RemoveCircleOutlineIcon } from '@mui/icons-material';
import {
  OverflowMenu,
  RoleSelection,
  UserCard
} from '@fiftyone/teams-components';
import { useMutation, useNotification } from '@fiftyone/hooks';
import { useState } from 'react';

type UsersTableRowProps = {
  datasetsCount: number;
  email: string;
  name: string;
  role: string;
  id: string;
  getOpenRoles: (role: string) => {};
  refetchOpenRoles: () => void;
  picture?: string;
};

export default function UsersTableRow(props: UsersTableRowProps) {
  const { datasetsCount, role, id, picture, getOpenRoles, refetchOpenRoles } =
    props;

  const [_, sendNotification] = useNotification();
  const [currentRole, setCurrentRole] = useState(role);
  const roleOptions = getOpenRoles(role);

  let datasetText = 'datasets';
  if (datasetsCount == 1) {
    datasetText = 'dataset';
  }
  const [setUserRole] = useMutation(teamSetUserRoleMutation);
  const setTeamRemoveTeammateTargetState = useSetRecoilState(
    teamRemoveTeammateTargetState
  );
  const setTeamRemoveTeammateOpenState = useSetRecoilState(
    teamRemoveTeammateOpenState
  );

  // To be supported in future
  const setSelectedUser = useSetRecoilState(settingsTeamSelectedUserId);

  return (
    <TableRow data-testid={`user-table-row-${name}`}>
      <TableCell>
        <UserCard src={picture} {...props} detailed />
      </TableCell>
      <TableCell>
        <Button
          variant="text"
          onClick={() => {
            setSelectedUser(id);
          }}
        >
          {datasetsCount} {datasetText}
        </Button>
      </TableCell>
      <TableCell>
        <RoleSelection
          containerProps={{ 'data-testid': `role-selection-${name}` }}
          items={roleOptions}
          defaultValue={role}
          value={currentRole}
          selectProps={{ sx: { minWidth: '8rem' } }}
          onChange={(role) => {
            setUserRole({
              variables: { userId: id, role: role },
              onSuccess: () => {
                setCurrentRole(role);
                sendNotification({
                  msg: 'Successfully updated user role',
                  variant: 'success'
                });
                refetchOpenRoles();
              },
              onError: (error) => {
                console.log('error', error);
              }
            });
          }}
        />
      </TableCell>
      <TableCell>
        <OverflowMenu
          items={[
            {
              primaryText: 'Remove from team',
              IconComponent: <RemoveCircleOutlineIcon />,
              onClick: () => {
                setTeamRemoveTeammateTargetState(props);
                setTeamRemoveTeammateOpenState(true);
              }
            }
          ]}
        />
      </TableCell>
    </TableRow>
  );
}
