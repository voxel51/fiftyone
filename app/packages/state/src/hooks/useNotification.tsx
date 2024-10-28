import Close from "@mui/icons-material/Close";
import { IconButton, Link } from "@mui/material";
import { enqueueSnackbar, closeSnackbar, OptionsObject } from "notistack";
import React from "react";

const SNACKBAR_AUTO_HIDE_DURATION = 3000;

export default function useNotification(): (
  options: NotificationOption
) => void {
  return (options: NotificationOption) => {
    const { msg, link } = options;
    enqueueSnackbar({
      key: msg,
      message: link ? (
        <Link
          href={link}
          target="_self"
          rel="noopener"
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {msg}
        </Link>
      ) : (
        msg
      ),
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
  link?: string;
};
