import { isGroupType, useUserRole } from "@fiftyone/hooks";
import { isGroup } from "@fiftyone/state";
import {
  DatasetPermissionSelection,
  RoleSelection,
  UserCard,
  WithTooltip,
} from "@fiftyone/teams-components";
import { DatasetPermissionSelectionProps } from "@fiftyone/teams-components/src/DatasetPermissionSelection";
import { UserCardProps } from "@fiftyone/teams-components/src/UserCard";
import {
  DatasetPermission,
  Group,
  Role,
  User as UserType,
} from "@fiftyone/teams-state";
import { MANUAL_GROUP_MGMT_DISABLED_TEXT } from "@fiftyone/teams-state/src/constants";
import { DeleteOutline } from "@mui/icons-material";
import { IconButton, TableCell, TableRow, Typography } from "@mui/material";
import { capitalize } from "lodash";
import { useEffect } from "react";

type PropTypes = {
  target: UserType | Group;
  permission: DatasetPermission;
  maxDatasetPermission: DatasetPermission;
  onPermissionChange?: (permission: DatasetPermission) => void;
  onRoleSelectionChange?: (role: string) => void;
  onDelete: (target: UserType | Group) => void;
  hideRole?: boolean;
  userCardProps?: UserCardProps;
  permissionSelectionProps?: DatasetPermissionSelectionProps;
  readOnly?: boolean;
};

export default function ManageUser({
  maxDatasetPermission,
  target,
  permission,
  onPermissionChange,
  onRoleSelectionChange,
  onDelete,
  hideRole,
  userCardProps = {},
  permissionSelectionProps = {},
  readOnly = false,
}: PropTypes) {
  const { getRoles, getMinRequiredRole } = useUserRole();
  const items = getRoles(permission);

  // if onRoleSelectionChange is provided for unregistered user, set the value based on the default permission
  useEffect(() => {
    if (onRoleSelectionChange && target && !target.id) {
      onRoleSelectionChange(getMinRequiredRole(permission));
    }
  }, [getMinRequiredRole, onRoleSelectionChange, permission, target]);

  return (
    <TableRow key={target.id}>
      <TableCell width="40%">
        <UserCard
          name={target.name}
          email={target?.description ?? target?.email}
          src={target?.picture}
          detailed
          titleSx={{ maxWidth: "150px" }}
          {...userCardProps}
        />
      </TableCell>
      {!hideRole && (
        <TableCell width="20%">
          <Typography variant="body1">
            {isGroupType(target)
              ? capitalize(target.usersCount)
              : capitalize(target.role)}
          </Typography>
        </TableCell>
      )}
      {onPermissionChange && (
        <TableCell width="20%" sx={{ px: 0 }}>
          <DatasetPermissionSelection
            defaultValue={permission}
            onChange={onPermissionChange}
            disabledPermissions={
              !isGroupType(target)
                ? getDisabledPermissions(
                    target.role,
                    target.id,
                    maxDatasetPermission
                  )
                : []
            }
            disabled={readOnly}
            {...permissionSelectionProps}
          />
        </TableCell>
      )}
      {onRoleSelectionChange && !target.id && (
        <TableCell width="10%" sx={{ pr: 0 }}>
          <RoleSelection
            key={permission}
            items={items}
            defaultValue={getMinRequiredRole(permission) || ""}
            selectProps={{ fullWidth: true, size: "small" }}
            onChange={(role) => {
              onRoleSelectionChange(role as Role);
            }}
            disabled={readOnly}
          />
        </TableCell>
      )}
      <TableCell width="10%" align="right" sx={{ pl: 1 }}>
        <WithTooltip disabled={readOnly} text={MANUAL_GROUP_MGMT_DISABLED_TEXT}>
          <IconButton
            onClick={() => {
              onDelete(target);
            }}
            disabled={readOnly}
          >
            <DeleteOutline />
          </IconButton>
        </WithTooltip>
      </TableCell>
    </TableRow>
  );
}

export function getDisabledPermissions(
  role: Role,
  userId: string,
  maxPermission: DatasetPermission
) {
  const disabledPermissions = [];
  const canManage = maxPermission === "MANAGE";
  const canEdit = ["MANAGE", "EDIT"].includes(maxPermission);
  const canTag = ["MANAGE", "EDIT", "TAG"].includes(maxPermission);
  const canView = ["MANAGE", "EDIT", "TAG", "VIEW"].includes(maxPermission);
  const roleLabel = capitalize(role);

  if (!canManage) {
    const type = userId ? `${capitalize(role)}s` : "Unregistered users";
    disabledPermissions.push({
      permission: "MANAGE",
      reason: `${type} cannot have manage permissions`,
    });
  }
  if (!canEdit && userId) {
    disabledPermissions.push({
      permission: "EDIT",
      reason: `${roleLabel}s cannot have edit permission`,
    });
  }
  if (!canTag && userId) {
    disabledPermissions.push({
      permission: "TAG",
      reason: `${roleLabel}s cannot have tag permission`,
    });
  }
  if (!canView && userId) {
    disabledPermissions.push({
      permission: "VIEW",
      reason: `${roleLabel}s cannot have view permission`,
    });
  }

  return disabledPermissions;
}
