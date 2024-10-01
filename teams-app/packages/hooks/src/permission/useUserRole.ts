import {
  useCurrentUser,
  useLazyLoadLatestQuery,
  useUserAudit,
} from "@fiftyone/hooks";
import {
  OrganizationFeatureFlagQueryT,
  OrganizationFeatureFlagsQuery,
  securityRoleAttrFragment,
  securityRolesExecuteCustomPluginsQuery,
  securityRolesManageInvitationsQuery,
  securityRolesMaxDatasetPermissionQuery,
} from "@fiftyone/teams-state";
import {
  DATASET_PERMISSIONS,
  OPERATOR_DATASET_PERMISSIONS,
  OPERATOR_USER_ROLES,
  USER_ROLES,
} from "@fiftyone/teams-state/src/constants";
import { useCallback, useMemo } from "react";
import { useFragment } from "react-relay";

export default function useUserRole() {
  const {
    featureFlag: {
      invitationsEnabled: enableInvitations = false,
      invitationEmailsEnabled: canSendEmailInvitations,
    },
  } = useLazyLoadLatestQuery<OrganizationFeatureFlagQueryT>(
    OrganizationFeatureFlagsQuery,
    {},
    { fetchPolicy: "store-or-network" }
  );

  const [currentUser] = useCurrentUser();
  const currentRole = currentUser?.role;
  const { hasSeatsLeft, error: userAuditError } = useUserAudit();

  const { roles } = useLazyLoadLatestQuery(
    securityRolesMaxDatasetPermissionQuery,
    {},
    { fetchPolicy: "store-and-network" }
  );

  const { roles: rolesWithExecuteCustomPluginsPermission } =
    useLazyLoadLatestQuery(
      securityRolesExecuteCustomPluginsQuery,
      {},
      { fetchPolicy: "store-and-network" }
    );

  const { roles: rolesWithInvitations } = useLazyLoadLatestQuery(
    securityRolesManageInvitationsQuery,
    {},
    { fetchPolicy: "store-and-network" }
  );

  const rolePermissions = roles.reduce((acc, { role, attribute }) => {
    const permissionData = useFragment(securityRoleAttrFragment, attribute);
    acc[role] = permissionData.permissionValue;
    return acc;
  }, {});

  const rolePluginPermissions = rolesWithExecuteCustomPluginsPermission.reduce(
    (acc, { role, attribute }) => {
      const customPlugInPermissionData = useFragment(
        securityRoleAttrFragment,
        attribute
      );
      acc[role] = customPlugInPermissionData.boolValue;
      return acc;
    },
    {}
  );

  const roleInvitations = rolesWithInvitations.reduce(
    (acc, { role, attribute }) => {
      const invitationData = useFragment(securityRoleAttrFragment, attribute);
      acc[role] = invitationData.boolValue;
      return acc;
    },
    {}
  );

  const isRoleHigher = useCallback(
    (role) => {
      return (
        USER_ROLES.indexOf(role) >=
        USER_ROLES.findIndex((r) => r.id === currentRole)
      );
    },
    [currentRole]
  );

  const hasNoSeats = useCallback(
    (roleId) => !hasSeatsLeft(roleId),
    [hasSeatsLeft]
  );

  const getRolesCommon = useCallback(
    (permission, checkPermission = false, inviteeRole?: string) => {
      return USER_ROLES.map((role) => {
        const isHigherRole = isRoleHigher(role);
        const isHigherPermission = checkPermission
          ? roleAllowsPermission(role.id, permission, rolePermissions)
          : true;
        const isNoSeat = hasNoSeats(role.id);

        const inviteeRoleHasNotChanged = inviteeRole && role.id === inviteeRole;

        const disabled =
          !(isHigherRole && isHigherPermission && !isNoSeat) ||
          inviteeRoleHasNotChanged;

        const messageList = [];
        if (userAuditError) {
          messageList.push("Failed to get license data.");
        } else if (isNoSeat) {
          messageList.push("No seats available");
        }

        if (!isHigherRole) {
          messageList.push(
            "You can not set a role higher than your current role"
          );
        }
        if (!isHigherPermission) {
          messageList.push("The role does not allow selected permission");
        }
        if (inviteeRole && role.id === inviteeRole) {
          messageList.push("currently assigned role");
        }

        const messages = messageList.join("; ");

        return {
          ...role,
          disabled,
          disabledInfo: disabled ? `Disabled: ${messages}` : undefined,
        };
      });
    },
    [isRoleHigher, hasNoSeats, roleAllowsPermission, userAuditError]
  );

  const getRoles = useCallback(
    (permission) => {
      return getRolesCommon(permission, true);
    },
    [getRolesCommon]
  );

  const getInviteRoles = useCallback(
    (inviteeRole?: string) => {
      return getRolesCommon(null, false, inviteeRole);
    },
    [getRolesCommon]
  );

  const getMinRequiredRole = useCallback(
    (permission) => {
      const roles = getRoles(permission);
      return roles.reduce((acc, role) => {
        return !role.disabled &&
          roleAllowsPermission(role.id, permission, rolePermissions)
          ? role.id
          : acc;
      }, null);
    },
    [getRoles]
  );

  const operatorMinRoleOptions = useMemo(() => {
    return OPERATOR_USER_ROLES.map((role) => {
      let disabled;
      let disabledInfo = "";

      if (rolePluginPermissions[role.id.toUpperCase()]) {
        disabled = false;
      } else {
        disabled = true;
        disabledInfo = `Disabled: This role cannot execute custom plugins`;
      }
      return {
        ...role,
        disabled,
        disabledInfo,
      };
    });
  }, [OPERATOR_USER_ROLES, rolePluginPermissions]);

  // return a list of options for the plug-in permission selection depending on the selected minimum role
  const getPlugInPermissionOptions = useCallback(
    (minimumRole) => {
      // get the max permission of the minimum role
      const maxRolePermission = rolePermissions[minimumRole];
      // return the list of permissions with disabled status
      return OPERATOR_DATASET_PERMISSIONS.map((perm) => {
        if (
          getPermissionLevel(perm.id) > getPermissionLevel(maxRolePermission)
        ) {
          return {
            ...perm,
            description: `People with ${perm.label} permission or higher on the current dataset can execute operator`,
            disabled: true,
            disabledInfo: `${capitalizeFirstLetter(
              minimumRole
            )} cannot have ${perm.id.toLowerCase()} permission. `,
          };
        } else {
          return perm;
        }
      });
    },
    [rolePermissions]
  );

  return {
    getRoles,
    getMinRequiredRole,
    getInviteRoles,
    canInvite: enableInvitations && roleInvitations[currentRole],
    canSendEmailInvitations,
    getPlugInPermissionOptions,
    operatorMinRoleOptions,
  };
}

const getPermissionLevel = (permissionId) => {
  const permission = DATASET_PERMISSIONS.find(
    (perm) => perm.id === permissionId
  );
  return permission ? permission.enum : -1;
};

// role max permission is dynamic and depends on the deployment license file
const roleAllowsPermission = (role, permission, rolePermissions) => {
  const roleMaxPermission = rolePermissions[role];
  const roleMaxPermissionLevel = getPermissionLevel(roleMaxPermission);
  const requiredPermissionLevel = getPermissionLevel(permission);

  return roleMaxPermissionLevel >= requiredPermissionLevel;
};

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
