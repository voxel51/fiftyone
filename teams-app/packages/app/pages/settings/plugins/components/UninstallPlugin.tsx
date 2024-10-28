import { useMutation } from "@fiftyone/hooks";
import { Dialog } from "@fiftyone/teams-components";
import {
  removePluginMutation,
  uninstallPluginAtom,
} from "@fiftyone/teams-state";
import { Typography } from "@mui/material";
import { useRecoilState } from "recoil";
import { PluginsRefreshProps } from "./types";
import { useCallback } from "react";

export default function UninstallPlugin(props: PluginsRefreshProps) {
  const { refresh } = props;
  const [state, setState] = useRecoilState(uninstallPluginAtom);
  const [removePlugin, removingPlugin] = useMutation(removePluginMutation);

  const { pluginName, open } = state;

  const handleClose = useCallback(() => {
    setState({ ...state, open: false });
  }, [setState, state]);

  return (
    <Dialog
      title="Uninstall this plugin?"
      open={open}
      confirmationButtonColor="error"
      onClose={handleClose}
      confirmationButtonText="Uninstall"
      disableConfirmationButton={removingPlugin}
      loading={removingPlugin}
      onConfirm={() => {
        removePlugin({
          successMessage: `Successfully uninstalled the plugin "${pluginName}"`,
          variables: { pluginName },
          onSuccess: () => {
            handleClose();
            refresh();
          },
        });
      }}
    >
      <Typography>
        Are you sure you want to uninstall this plugin? This cannot be undone.
      </Typography>
    </Dialog>
  );
}
