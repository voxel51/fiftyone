import { useMutation, withPermissions } from "@fiftyone/hooks";
import { SettingsLayout } from "@fiftyone/teams-components";
import {
  MANAGE_ORGANIZATION,
  mainTitleSelector,
  securityOrganizationSettingsQuery,
  securitySetOrganizationSettingsMutation,
} from "@fiftyone/teams-state";
import withRelay from "lib/withRelay";
import { useEffect, useState } from "react";
import { usePreloadedQuery } from "react-relay";
import { useSetRecoilState } from "recoil";
import DatasetPermissionSetting from "../components/DatasetPermissionSetting";
import OperatorDatasetPermissionSetting from "../components/OperatorDatasetPermissionSetting";
import OperatorRoleSetting from "../components/OperatorRoleSetting";
import RoleSetting from "../components/RoleSetting";
import SettingsGroup from "../components/SettingsGroup";

const pluginCaption =
  "Changing this setting will only effect plugins installed in the future.";
const organizationSettingGroups = [
  {
    title: "Users",
    description:
      "You can configure organization-wide settings for new and existing users.",
    settings: [
      {
        id: "defaultUserRole",
        Component: RoleSetting,
        label: "Default role for new users",
      },
    ],
  },
  {
    title: "Datasets",
    description: "You can configure organization-wide settings for datasets.",
    settings: [
      {
        id: "defaultDatasetPermission",
        Component: DatasetPermissionSetting,
        label: "Default member access for new datasets",
        caption:
          "Changing this setting will only effect datasets created in the future.",
      },
    ],
  },
  {
    title: "Plugins",
    description: "You can configure organization-wide settings for plugins.",
    settings: [
      {
        id: "defaultOperatorMinimumRole",
        Component: OperatorRoleSetting,
        label: "Default minimum role for operator",
        caption: pluginCaption,
      },
      {
        id: "defaultOperatorMinimumDatasetPermission",
        Component: OperatorDatasetPermissionSetting,
        label: "Default minimum dataset permission for operator",
        caption: pluginCaption,
      },
    ],
  },
];

function Security({ preloadedQuery }) {
  const setPageTitle = useSetRecoilState(mainTitleSelector);
  useEffect(() => {
    setPageTitle("Settings");
  }, []);
  const { organizationSettings } = usePreloadedQuery(
    securityOrganizationSettingsQuery,
    preloadedQuery
  );
  const [setOrgSettings] = useMutation(securitySetOrganizationSettingsMutation);
  const [updatesInProgress, setUpdatesInProgress] = useState(new Set());

  function setSettings(settings: object, id: string) {
    setUpdatesInProgress((state) => new Set(state).add(id));
    setOrgSettings({
      variables: settings,
      successMessage: "Successfully updated the setting",
      errorMessage: "Failed to update the setting",
      onCompleted() {
        setUpdatesInProgress((state) => {
          const updatedState = new Set(state);
          updatedState.delete(id);
          return updatedState;
        });
      },
    });
  }

  function isUpdating(id: string) {
    return updatesInProgress.has(id);
  }

  function handleSettingChange(id: string, value: unknown) {
    setSettings({ [id]: value }, id);
  }

  return (
    <SettingsLayout>
      {organizationSettingGroups.map(({ title, description, settings }, i) => (
        <SettingsGroup
          key={title}
          title={title}
          description={description}
          settings={settings.map(({ id, ...props }) => ({
            id,
            ...props,
            value: organizationSettings[id],
            updating: isUpdating(id),
          }))}
          onChange={handleSettingChange}
          sx={i > 0 ? { pt: 4 } : {}}
        />
      ))}
    </SettingsLayout>
  );
}

export default withRelay(
  withPermissions(Security, [MANAGE_ORGANIZATION], "user"),
  securityOrganizationSettingsQuery,
  {}
);
