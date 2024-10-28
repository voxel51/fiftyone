import { useMutation } from "@fiftyone/hooks";
import {
  BasicTable,
  Button,
  EmptyState,
  OverflowMenu,
  Timestamp,
} from "@fiftyone/teams-components";
import {
  UPLOAD_PLUGIN_MODE,
  enableDisablePluginMutation,
  manageOperatorsPluginAtom,
  uninstallPluginAtom,
  uploadPluginAtom,
} from "@fiftyone/teams-state";
import { RemoveCircleOutline, UpgradeOutlined } from "@mui/icons-material";
import { FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import { useState } from "react";
import { useSetRecoilState } from "recoil";
import { PluginsComponentProps } from "./types";

export default function PluginsList(props: PluginsComponentProps) {
  const { plugins } = props;
  const setUninstallPluginState = useSetRecoilState(uninstallPluginAtom);
  const setUploadPluginState = useSetRecoilState(uploadPluginAtom);

  if (plugins.length === 0) return <EmptyState resource="plugins installed" />;
  return (
    <BasicTable
      rows={[
        ...plugins.map((plugin) => {
          const { name, modifiedAt, version, description } = plugin;
          return {
            id: name,
            cells: [
              {
                id: name + "-name",
                Component: (
                  <Stack>
                    <Typography variant="body2">{name}</Typography>
                    {description && <Typography>{description}</Typography>}
                  </Stack>
                ),
              },
              { id: name + "-version", value: version },
              {
                id: name + "-operators",
                Component: <OperatorsCount {...plugin} />,
              },
              {
                id: name + "-modifiedAt",
                Component: modifiedAt ? (
                  <Typography>
                    Modified <Timestamp timestamp={modifiedAt} />
                  </Typography>
                ) : (
                  ""
                ),
              },
              {
                id: name + "-toggle",
                Component: <TogglePlugin {...plugin} />,
              },
              {
                id: name + "-manage",
                Component: (
                  <OverflowMenu
                    items={[
                      {
                        primaryText: "Uninstall plugin",
                        IconComponent: (
                          <RemoveCircleOutline color="secondary" />
                        ),
                        onClick: () => {
                          setUninstallPluginState({
                            pluginName: name,
                            open: true,
                          });
                        },
                      },
                      {
                        primaryText: "Upgrade plugin",
                        IconComponent: <UpgradeOutlined color="secondary" />,
                        onClick: () => {
                          setUploadPluginState({
                            mode: UPLOAD_PLUGIN_MODE.UPGRADE,
                            open: true,
                            pluginName: name,
                          });
                        },
                      },
                    ]}
                  />
                ),
              },
            ],
          };
        }),
      ]}
    />
  );
}

function OperatorsCount(props) {
  const setManageOperatorsPluginState = useSetRecoilState(
    manageOperatorsPluginAtom
  );
  const { name, operators } = props;
  if (!Array.isArray(operators)) return null;
  const label = operators.length === 1 ? "operator" : "operators";
  return (
    <Button
      onClick={() =>
        setManageOperatorsPluginState({ pluginName: name, open: true })
      }
    >
      {operators.length} {label}
    </Button>
  );
}

function TogglePlugin(props) {
  const [togglePlugin, togglingPlugin] = useMutation(
    enableDisablePluginMutation
  );
  const { name, enabled } = props;
  const [checked, setChecked] = useState(enabled);
  const label = checked ? "Enabled" : "Disabled";
  const updateType = !checked ? "enabled" : "disabled";

  return (
    <FormControlLabel
      control={
        <Switch
          sx={{ mr: 1 }}
          size="small"
          checked={checked}
          disabled={togglingPlugin}
          onChange={(e) => {
            togglePlugin({
              variables: { pluginName: name, enabled: !checked },
              onSuccess() {
                setChecked(!checked);
              },
              successMessage: `Successfully ${updateType} the plugin`,
            });
          }}
        />
      }
      label={label}
    />
  );
}
