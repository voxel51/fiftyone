import { Button, ButtonProps, IconButton, Stack, SvgIcon } from "@mui/material";
import { closeSnackbar, enqueueSnackbar, OptionsObject } from "notistack";

const SNACKBAR_AUTO_HIDE_DURATION = 3000;

export default function useNotification(): (
  options: NotificationOption,
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
            <SvgIcon
              viewBox="0 0 18 18"
              fontSize="small"
              sx={{ color: "#FFFFFF" }}
            >
              <path d="M9 10.4905L3.78327 15.7072C3.58809 15.9024 3.33967 16 3.03802 16C2.73638 16 2.48796 15.9024 2.29278 15.7072C2.09759 15.512 2 15.2636 2 14.962C2 14.6603 2.09759 14.4119 2.29278 14.2167L7.50951 9L2.29278 3.78327C2.09759 3.58809 2 3.33967 2 3.03802C2 2.73638 2.09759 2.48796 2.29278 2.29278C2.48796 2.09759 2.73638 2 3.03802 2C3.33967 2 3.58809 2.09759 3.78327 2.29278L9 7.50951L14.2167 2.29278C14.4119 2.09759 14.6603 2 14.962 2C15.2636 2 15.512 2.09759 15.7072 2.29278C15.9024 2.48796 16 2.73638 16 3.03802C16 3.33967 15.9024 3.58809 15.7072 3.78327L10.4905 9L15.7072 14.2167C15.9024 14.4119 16 14.6603 16 14.962C16 15.2636 15.9024 15.512 15.7072 15.7072C15.512 15.9024 15.2636 16 14.962 16C14.6603 16 14.4119 15.9024 14.2167 15.7072L9 10.4905Z" />
            </SvgIcon>
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
