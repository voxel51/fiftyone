import {
  DatasetPermissionSelection,
  UserCard
} from '@fiftyone/teams-components';
import { DatasetPermissionSelectionProps } from '@fiftyone/teams-components/src/DatasetPermissionSelection';
import { UserCardProps } from '@fiftyone/teams-components/src/UserCard';
import {
  DatasetPermission,
  Group,
  User,
  User as UserType
} from '@fiftyone/teams-state';
import { DeleteOutline } from '@mui/icons-material';
import { IconButton, TableCell, TableRow, Typography } from '@mui/material';
import { capitalize } from 'lodash';
import Link from 'next/link';
import { getDisabledPermissions } from './ManageUser';

type PropTypes = {
  maxDatasetPermission: DatasetPermission | null; // Group doesn't have a role
  target: UserType | Group;
  isGroup: boolean;
  permission: DatasetPermission;
  onPermissionChange?: (permission: DatasetPermission) => void;
  onDelete: (target: UserType | Group) => void;
  hideRole?: boolean;
  userCardProps?: UserCardProps;
  permissionSelectionProps?: DatasetPermissionSelectionProps;
};

export default function ManageGroupUserTableRow({
  maxDatasetPermission,
  target,
  isGroup = false,
  permission,
  onPermissionChange,
  onDelete,
  hideRole,
  userCardProps,
  permissionSelectionProps
}: PropTypes) {
  const { id, name, role, description, email, picture, slug } = isGroup
    ? (target as Group)
    : (target as User);

  const renderTitleCell = () => {
    return (
      <TableCell width="50%" sx={isGroup ? { cursor: 'pointer' } : {}}>
        <UserCard
          {...(userCardProps ?? {})}
          name={name}
          email={description ?? email}
          src={picture}
          detailed
        />
      </TableCell>
    );
  };

  const renderGroupTitleCell = () => {
    return (
      <Link href={`/settings/team/groups/${slug}`} title={'See group'}>
        {renderTitleCell()}
      </Link>
    );
  };

  return (
    <TableRow key={id}>
      {isGroup ? renderGroupTitleCell() : renderTitleCell()}
      {!hideRole && (
        <TableCell width="20%">
          <Typography variant="body1">
            {isGroup ? 'Group' : capitalize(role)}
          </Typography>
        </TableCell>
      )}
      {onPermissionChange && (
        <TableCell width="20%">
          <DatasetPermissionSelection
            {...(permissionSelectionProps ?? {})}
            defaultValue={permission}
            value={permission}
            onChange={onPermissionChange}
            disabledPermissions={
              !isGroup
                ? getDisabledPermissions(role, id, maxDatasetPermission)
                : []
            }
          />
        </TableCell>
      )}
      <TableCell width="10%" align="right">
        <IconButton
          onClick={() => {
            onDelete(target);
          }}
        >
          <DeleteOutline />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}
