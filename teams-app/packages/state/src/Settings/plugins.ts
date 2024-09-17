import { graphql } from 'react-relay/hooks';
import { atom } from 'recoil';

export enum UPLOAD_PLUGIN_MODE {
  INSTALL = 'install',
  UPGRADE = 'upgrade'
}

export const uploadPluginAtom = atom<{
  open?: boolean;
  mode?: UPLOAD_PLUGIN_MODE;
  pluginName?: string;
}>({
  key: 'uploadPluginAtom',
  default: {}
});

export const manageOperatorsPluginAtom = atom<{
  open?: boolean;
  pluginName?: string;
}>({
  key: 'manageOperatorsPluginAtom',
  default: {}
});

export const uninstallPluginAtom = atom<{
  open?: boolean;
  pluginName?: string;
}>({
  key: 'uninstallPluginAtom',
  default: {}
});

export const pluginsQuery = graphql`
  query pluginsQuery {
    plugins {
      description
      enabled
      fiftyoneVersion
      name
      version
      modifiedAt
      operators {
        enabled
        name
        permission {
          minimumDatasetPermission
          minimumRole
        }
      }
    }
  }
`;

export const uploadPluginMutation = graphql`
  mutation pluginsUploadMutation($fileUploadToken: String!) {
    uploadPlugin(fileUploadToken: $fileUploadToken) {
      description
      enabled
      fiftyoneVersion
      name
      operators {
        enabled
        name
        permission {
          minimumDatasetPermission
          minimumRole
        }
      }
      version
    }
  }
`;

export const upgradePluginMutation = graphql`
  mutation pluginsUpgradeMutation(
    $fileUploadToken: String!
    $pluginName: String!
  ) {
    upgradePlugin(fileUploadToken: $fileUploadToken, pluginName: $pluginName) {
      description
      enabled
      fiftyoneVersion
      name
      operators {
        enabled
        name
        permission {
          minimumDatasetPermission
          minimumRole
        }
      }
      version
    }
  }
`;

export const removePluginMutation = graphql`
  mutation pluginsRemoveMutation($pluginName: String!) {
    removePlugin(name: $pluginName)
  }
`;

export const enableDisablePluginMutation = graphql`
  mutation pluginsEnableDisableMutation(
    $pluginName: String!
    $enabled: Boolean
  ) {
    updatePlugin(name: $pluginName, enabled: $enabled) {
      name
      enabled
    }
  }
`;

export const enableDisableOperatorMutation = graphql`
  mutation pluginsOperatorEnableDisableMutation(
    $pluginName: String!
    $operatorName: String!
    $enabled: Boolean
  ) {
    updatePlugin(
      name: $pluginName
      operatorSettings: { name: $operatorName, enabled: $enabled }
    ) {
      name
      operators {
        enabled
        name
      }
    }
  }
`;

export const setOperatorPermissionMutation = graphql`
  mutation pluginsOperatorSetPermissionMutation(
    $pluginName: String!
    $operatorName: String!
    $permission: DatasetPermission
  ) {
    updatePlugin(
      name: $pluginName
      operatorSettings: {
        name: $operatorName
        permission: { minimumDatasetPermission: $permission }
      }
    ) {
      name
      operators {
        name
        permission {
          minimumDatasetPermission
        }
      }
    }
  }
`;

export const setOperatorRoleMutation = graphql`
  mutation pluginsOperatorSetRoleMutation(
    $pluginName: String!
    $operatorName: String!
    $role: UserRole
  ) {
    updatePlugin(
      name: $pluginName
      operatorSettings: {
        name: $operatorName
        permission: { minimumRole: $role }
      }
    ) {
      name
      operators {
        name
        permission {
          minimumRole
        }
      }
    }
  }
`;
