import { DatasetPermission, Group } from "@fiftyone/teams-state";
import { Avatar, DatasetPermissionSelection } from "@fiftyone/teams-components";
import { DeleteOutline } from "@mui/icons-material";
import {
  IconButton,
  TableCell,
  TableRow,
  Table,
  TableBody,
} from "@mui/material";

import { getInitials } from "@fiftyone/teams-components/src/utils";

type PropTypes = {
  group: Group;
  permission: DatasetPermission;
  onPermissionChange: (permission: DatasetPermission) => void;
  onDelete: (group: Group) => void;
  cardProps?: any; // todo: import UserCard prop type
  permissionSelectionProps?: any;
};

export default function ManageGroup({
  group,
  permission,
  onPermissionChange,
  onDelete,
  cardProps,
  permissionSelectionProps = {},
}: PropTypes) {
  const { id, name, description } = group;
  const initial = getInitials(name);

  return (
    <Table>
      <TableBody>
        <TableRow key={id + name}>
          <TableCell width="50%">
            <Avatar
              alt={name}
              title={name}
              subtitle={description}
              detailed={true}
              {...cardProps}
            >
              {initial}
            </Avatar>
          </TableCell>
          <TableCell width="20%">
            <DatasetPermissionSelection
              value={permission}
              onChange={onPermissionChange}
              disabledPermissions={[]}
              {...permissionSelectionProps}
            />
          </TableCell>
          <TableCell width="10%" align="right">
            <IconButton
              onClick={() => {
                onDelete(group);
              }}
            >
              <DeleteOutline />
            </IconButton>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
