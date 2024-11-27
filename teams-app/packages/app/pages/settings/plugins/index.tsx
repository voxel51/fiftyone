import { useCurrentOrganization, withPermissions } from "@fiftyone/hooks";
import {
  Button,
  SectionHeader,
  SettingsLayout,
} from "@fiftyone/teams-components";
import {
  MANAGE_ORGANIZATION,
  UPLOAD_PLUGIN_MODE,
  mainTitleSelector,
  pluginsQuery,
  pluginsQueryT,
  uploadPluginAtom,
} from "@fiftyone/teams-state";
import { Add as AddIcon } from "@mui/icons-material";
import withRelay, { WithRelayProps } from "lib/withRelay";
import { useEffect } from "react";
import { usePreloadedQuery } from "react-relay";
import { useSetRecoilState } from "recoil";
import ManageOperators from "./components/ManageOperators";
import PluginsList from "./components/PluginsList";
import UninstallPlugin from "./components/UninstallPlugin";
import UploadPlugin from "./components/UploadPlugin";

function Plugins({ preloadedQuery, refresh }: WithRelayProps<pluginsQueryT>) {
  const setPageTitle = useSetRecoilState(mainTitleSelector);
  useEffect(() => {
    setPageTitle("Settings");
  }, []);
  const currentOrganization = useCurrentOrganization();
  const setState = useSetRecoilState(uploadPluginAtom);

  const organizationDisplayName = currentOrganization?.displayName;
  const { plugins } = usePreloadedQuery<pluginsQueryT>(
    pluginsQuery,
    preloadedQuery
  );

  return (
    <SettingsLayout>
      <SectionHeader
        title={"Plugins"}
        description={`Install and manage plugins for ${organizationDisplayName}.`}
      >
        <Button
          startIcon={<AddIcon />}
          onClick={() => {
            setState({
              mode: UPLOAD_PLUGIN_MODE.INSTALL,
              open: true,
            });
          }}
          variant="contained"
        >
          Install plugin
        </Button>
      </SectionHeader>
      <UploadPlugin refresh={refresh} />
      <PluginsList plugins={plugins} refresh={refresh} />
      <ManageOperators plugins={plugins} refresh={refresh} />
      <UninstallPlugin refresh={refresh} />
    </SettingsLayout>
  );
}

export default withRelay(
  withPermissions(Plugins, [MANAGE_ORGANIZATION], "user"),
  pluginsQuery,
  {}
);
