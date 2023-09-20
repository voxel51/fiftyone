import Close from "@mui/icons-material/Close";
import { IconButton } from "@mui/material";
import { enqueueSnackbar, closeSnackbar, OptionsObject } from "notistack";
import React from "react";

const SNACKBAR_AUTO_HIDE_DURATION = 3000;

export default function useNotification(): (
  options: NotificationOption
) => void {
  return (options: NotificationOption) => {
    const { msg } = options;
    enqueueSnackbar({
      key: msg,
      message: msg,
      anchorOrigin: { horizontal: "center", vertical: "bottom" },
      autoHideDuration: SNACKBAR_AUTO_HIDE_DURATION,
      preventDuplicate: true,
      action: (
        <IconButton
          onClick={() => {
            closeSnackbar(msg);
          }}
        >
          <Close fontSize="small" sx={{ color: "white" }} />
        </IconButton>
      ),
      ...options,
    });
  };
}

type NotificationOption = OptionsObject & {
  msg: string;
};
