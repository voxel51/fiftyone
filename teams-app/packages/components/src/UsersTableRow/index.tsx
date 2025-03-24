import {
  useMutation,
  useNotification,
  useUserDowngrade,
} from "@fiftyone/hooks";
import {
  OverflowMenu,
  RoleSelection,
  UserCard,
} from "@fiftyone/teams-components";
import {
  settingsTeamSelectedUserId,
  teamRemoveTeammateOpenState,
  teamRemoveTeammateTargetState,
  teamSetUserRoleMutation,
} from "@fiftyone/teams-state";
import { RemoveCircleOutline as RemoveCircleOutlineIcon } from "@mui/icons-material";
import { Button, TableCell, TableRow } from "@mui/material";
import { useCallback, useState } from "react";
import { useSetRecoilState } from "recoil";
import { isDowngradeRole } from "../utils";
import { UserRole } from "@fiftyone/hooks/src/user/__generated__/CurrentUserFragment.graphql";

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
  const {
    datasetsCount,
    name,
    role,
    id,
    picture,
    getOpenRoles,
    refetchOpenRoles,
    email,
  } = props;

  const restProps = { name, role, id, picture, email };

  const [_, sendNotification] = useNotification();
  const {
    setDowngradeUserRoleState,
    setDowngradeUserRoleModalOpen,
    onClose,
    setIsLoading,
  } = useUserDowngrade();
  const [currentRole, setCurrentRole] = useState(role);
  const roleOptions = getOpenRoles(role);

  let datasetText = "datasets";
  if (datasetsCount == 1) {
    datasetText = "dataset";
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

  const updateUserRole = useCallback(
    (id, newRole) => {
      setIsLoading(true);
      setUserRole({
        variables: { userId: id, role: newRole },
        onSuccess: () => {
          setIsLoading(false);
          setCurrentRole(newRole);
          sendNotification({
            msg: "Successfully updated user role",
            variant: "success",
          });
          refetchOpenRoles();
          onClose();
        },
        onError: (error) => {
          setIsLoading(false);
          console.log("error", error);
          sendNotification({
            msg: "Error updating user role",
            variant: "error",
          });
        },
      });
    },
    [setUserRole, sendNotification, refetchOpenRoles, setCurrentRole]
  );

  return (
    <TableRow data-testid={`user-table-row-${name}`}>
      <TableCell>
        <UserCard src={picture} {...restProps} detailed />
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
          containerProps={{ "data-testid": `role-selection-${name}` }}
          items={roleOptions}
          defaultValue={role}
          value={currentRole}
          selectProps={{ sx: { minWidth: "8rem" } }}
          onChange={(newRole) => {
            if (isDowngradeRole(role as UserRole, newRole)) {
              // Show confirmation dialog
              setDowngradeUserRoleState({
                userId: id,
                userName: name,
                currentRole: role as UserRole,
                newRole: newRole as UserRole,
                onConfirm: updateUserRole(id, newRole),
              });
              setDowngradeUserRoleModalOpen(true);
            } else {
              updateUserRole(id, newRole);
            }
          }}
        />
      </TableCell>
      <TableCell>
        <OverflowMenu
          items={[
            {
              primaryText: "Remove from team",
              IconComponent: <RemoveCircleOutlineIcon />,
              onClick: () => {
                setTeamRemoveTeammateTargetState(props);
                setTeamRemoveTeammateOpenState(true);
              },
            },
          ]}
        />
      </TableCell>
    </TableRow>
  );
}
