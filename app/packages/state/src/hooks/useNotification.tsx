import Close from "@mui/icons-material/Close";
import { Button, ButtonProps, IconButton, Stack } from "@mui/material";
import { closeSnackbar, enqueueSnackbar, OptionsObject } from "notistack";
import React from "react";

const SNACKBAR_AUTO_HIDE_DURATION = 3000;

export default function useNotification(): (
  options: NotificationOption
) => void {
  return (options: NotificationOption) => {
    const { msg, key, actions = [], ...otherOptions } = options;
    const computedKey = key ?? msg;
    enqueueSnackbar({
      key: computedKey,
      message: msg,
      anchorOrigin: { horizontal: "center", vertical: "bottom" },
      autoHideDuration: SNACKBAR_AUTO_HIDE_DURATION,
      preventDuplicate: true,
      action: (
        <Stack direction="row" spacing={1} alignItems="center">
          {actions.map((action) => {
            const { label, href, onClick, buttonProps } = action;
            return (
              <Button
                key={label}
                onClick={onClick}
                href={href}
                variant="outlined"
                sx={{
                  borderColor: "hsl(0deg 0% 100% / 30%)",
                  color: (theme) => theme.palette.text.primary,
                  "&:hover": {
                    borderColor: "hsl(0deg 0% 100% / 30%)",
                  },
                }}
                {...buttonProps}
              >
                {label}
              </Button>
            );
          })}
          <IconButton
            aria-label="Close notification"
            onClick={() => {
              closeSnackbar(computedKey);
            }}
          >
            <Close fontSize="small" sx={{ color: "#FFFFFF" }} />
          </IconButton>
        </Stack>
      ),
      ...otherOptions,
    });
  };
}

type NotificationOption = OptionsObject & {
  msg: string;
  actions?: ActionType[];
};

type ActionType = {
  label: string;
  href?: string;
  onClick?: () => void;
  buttonProps?: ButtonProps;
};
