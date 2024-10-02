import { Selection } from "@fiftyone/teams-components";
import {
  DATASET_PERMISSIONS,
  DATASET_PERMISSION_NO_ACCESS_ID,
} from "@fiftyone/teams-state/src/constants";
import { SelectProps } from "@mui/material";
import { merge } from "lodash";
import { SelectionProps } from "../Selection";

type Permission = "NO_ACCESS" | "VIEW" | "TAG" | "EDIT" | "MANAGE";

type DisabledPermission = {
  permission: Permission;
  reason?: string;
};

export type DatasetPermissionSelectionProps = Omit<SelectionProps, "items"> & {
  items?: SelectionProps["items"];
  defaultValue: Permission;
  value?: Permission;
  onChange?: (permission: Permission) => void;
  disabled?: boolean;
  readOnly?: boolean;
  includeNoAccess?: boolean;
  disabledPermissions?: Array<DisabledPermission>;
  selectProps?: SelectProps;
  loading?: boolean;
};

export default function DatasetPermissionSelection({
  defaultValue,
  value,
  onChange,
  disabled,
  readOnly,
  includeNoAccess,
  disabledPermissions = [],
  selectProps,
  loading,
  ...otherProps
}: DatasetPermissionSelectionProps) {
  const disabledPermissionsMap = {};
  for (const disabledPermission of disabledPermissions) {
    disabledPermissionsMap[disabledPermission.permission] =
      disabledPermission.reason || "";
  }

  const items = [];
  for (const permission of DATASET_PERMISSIONS) {
    const { id, ...permissionProps } = permission;
    if (id === DATASET_PERMISSION_NO_ACCESS_ID && !includeNoAccess) continue;
    items.push({
      ...permissionProps,
      id,
      disabled: disabledPermissionsMap.hasOwnProperty(id),
      disabledInfo: disabledPermissionsMap[id],
    });
  }

  return (
    <Selection
      items={items}
      defaultValue={defaultValue}
      value={value}
      onChange={onChange}
      selectProps={merge({ sx: { width: "9rem" } }, selectProps)}
      disabled={disabled}
      readOnly={readOnly}
      menuSize="large"
      loading={loading}
      {...otherProps}
    />
  );
}
