import { useMutation, useNotification } from "@fiftyone/hooks";
import { Box, Dialog, FileDrop } from "@fiftyone/teams-components";
import {
  UPLOAD_PLUGIN_MODE,
  uploadPluginAtom,
  uploadPluginMutation,
  upgradePluginMutation,
} from "@fiftyone/teams-state";
import { FILE_REST_ENDPOINT } from "@fiftyone/teams-state/src/constants";
import { fetch } from "@fiftyone/teams-utilities";
import { Typography } from "@mui/material";
import { useCallback, useState } from "react";
import { useRecoilState } from "recoil";
import { PluginsRefreshProps } from "./types";

export default function UploadPlugin({ refresh }: PluginsRefreshProps) {
  const [state, setState] = useRecoilState(uploadPluginAtom);
  const [file, setFile] = useState<File>();
  const [uploadingFile, setUploadingFile] = useState(false);
  const [_, sendNotification] = useNotification();

  const { open, mode, pluginName } = state;
  const isInstall = mode === UPLOAD_PLUGIN_MODE.INSTALL;

  const [uploadPlugin, uploadingPlugin] = useMutation(
    isInstall ? uploadPluginMutation : upgradePluginMutation
  );

  const handleClose = useCallback(() => {
    setState({ ...state, open: false });
    setFile(undefined);
  }, [state]);

  const loading = uploadingFile || uploadingPlugin;

  return (
    <Dialog
      open={open}
      title={<Title isInstall={isInstall} />}
      onClose={handleClose}
      onConfirm={async () => {
        const formData = new FormData();
        formData.append("file", file as File);
        setUploadingFile(true);
        const { result, error } = await fetch(FILE_REST_ENDPOINT, {
          method: "POST",
          body: formData,
        });
        setUploadingFile(false);
        if (error) {
          sendNotification({
            variant: "error",
            msg: error.message || "Failed to upload plugin",
          });
        } else {
          const fileUploadToken = result?.file_token;
          if (!fileUploadToken) {
            sendNotification({
              variant: "error",
              msg: "Failed to upload plugin. Something went wrong.",
            });
          }
          uploadPlugin({
            variables: { fileUploadToken, pluginName },
            successMessage: `Successfully ${
              isInstall ? "installed" : "upgraded"
            } the plugin`,
            onSuccess() {
              handleClose();
              refresh();
            },
          });
        }
      }}
      disableConfirmationButton={!Boolean(file) || loading}
      confirmationButtonText={isInstall ? "Install" : "Upgrade"}
      loading={loading}
    >
      <Typography variant="body1"></Typography>
      <FileDrop
        onChange={(files) => {
          setFile(files[0]);
        }}
        types=".zip"
        caption="Only .zip file is supported"
      />
    </Dialog>
  );
}

function Title(props) {
  const { isInstall } = props;

  return (
    <Box sx={{ pb: 2 }}>
      <Typography variant="h6">
        {isInstall ? "Install" : "Upgrade"} plugin
      </Typography>
      <Typography>
        You can {isInstall ? "install a new" : "upgrade a"} plugin by uploading
        the zip of FiftyOne plugin directory.
      </Typography>
    </Box>
  );
}
