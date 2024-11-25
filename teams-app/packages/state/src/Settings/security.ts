import { graphql } from "react-relay";

export const securityOrganizationSettingsQuery = graphql`
  query securityOrganizationSettingsQuery {
    organizationSettings {
      defaultDatasetPermission
      defaultOperatorMinimumDatasetPermission
      defaultOperatorMinimumRole
      defaultUserRole
    }
  }
`;

export const securitySetOrganizationSettingsMutation = graphql`
  mutation securitySetOrganizationSettingsMutation(
    $defaultDatasetPermission: DatasetPermission
    $defaultOperatorMinimumDatasetPermission: DatasetPermission
    $defaultOperatorMinimumRole: UserRole
    $defaultUserRole: UserRole
  ) {
    setOrganizationSettings(
      defaultDatasetPermission: $defaultDatasetPermission
      defaultOperatorMinimumDatasetPermission: $defaultOperatorMinimumDatasetPermission
      defaultOperatorMinimumRole: $defaultOperatorMinimumRole
      defaultUserRole: $defaultUserRole
    ) {
      defaultDatasetPermission
      defaultOperatorMinimumDatasetPermission
      defaultOperatorMinimumRole
      defaultUserRole
    }
  }
`;

export * as organizationSettingsQuery from "./__generated__/securityOrganizationSettingsQuery.graphql";
export * as setOrganizationSettingsMutation from "./__generated__/securitySetOrganizationSettingsMutation.graphql";

// define the fragments
export const securityRoleAttrFragment = graphql`
  fragment securityAttrFrag on UserAttributeInfo {
    ... on BoolUserAttributeInfo {
      attribute
      display
      description
      __typename
      boolValue: value
      boolOptions: options
    }
    ... on DatasetAccessLevelUserAttributeInfo {
      attribute
      display
      description
      __typename
      accessLevelValue: value
      accessLevelOptions: options
    }
    ... on DatasetPermissionUserAttributeInfo {
      attribute
      display
      description
      __typename
      permissionValue: value
      permissionOptions: options
    }
  }
`;

// query the attributes that we display in security roles page
// currently we do not display execute builtin plugins
// because BE is not fully implemented
export const securityDisplayRolesQuery = graphql`
  query securityGetEverythingQuery {
    roles {
      role
      attributes(exclude: [EXECUTE_BUILTIN_PLUGINS]) {
        ...securityAttrFrag
      }
    }
  }
`;

// query the max_dataset_permission for all roles
export const securityRolesMaxDatasetPermissionQuery = graphql`
  query securityGetBySpecificAttributeQuery {
    roles {
      role
      attribute(attribute: MAX_DATASET_PERMISSION) {
        ...securityAttrFrag
      }
    }
  }
`;

// query the EXECUTE_CUSTOM_PLUGINS for all roles
export const securityRolesExecuteCustomPluginsQuery = graphql`
  query securityGetBySpecificAttributeCustomPluginQuery {
    roles {
      role
      attribute(attribute: EXECUTE_CUSTOM_PLUGINS) {
        ...securityAttrFrag
      }
    }
  }
`;

// query the MANAGE_INVITATIONS for all roles
export const securityRolesManageInvitationsQuery = graphql`
  query securityGetBySpecificAttributeInvitationQuery {
    roles {
      role
      attribute(attribute: MANAGE_INVITATIONS) {
        ...securityAttrFrag
      }
    }
  }
`;
