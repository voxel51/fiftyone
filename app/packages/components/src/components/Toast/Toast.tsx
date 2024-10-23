import React from "react";
import { atom, useRecoilState } from "recoil";
import { Box, Snackbar, SnackbarContent } from "@mui/material";

interface ToastProps {
  message: React.ReactNode;
  primary: (
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
  ) => React.ReactNode;
  secondary: (
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
  ) => React.ReactNode;
  duration?: number;
  layout?: {
    vertical?: "top" | "bottom";
    horizontal?: "left" | "center" | "right";
    height?: number | string;
    backgroundColor?: string;
    color?: string;
  };
}

const toastStateAtom = atom({
  key: "toastOpenState",
  default: true,
});

const Toast: React.FC<ToastProps> = ({
  message,
  primary,
  secondary,
  duration = 5000,
  layout = {},
}) => {
  const [open, setOpen] = useRecoilState(toastStateAtom);

  const handleClose = React.useCallback(
    (event, reason) => {
      if (reason === "clickaway") return;
      setOpen(false);
    },
    [setOpen]
  );

  const action = React.useMemo(
    () => (
      <div>
        <Box display="flex" justifyContent="flex-end">
          {primary(setOpen)}
          {secondary(setOpen)}
        </Box>
      </div>
    ),
    [primary, secondary, setOpen]
  );

  return (
    <Snackbar
      anchorOrigin={{
        vertical: layout.vertical ?? "bottom",
        horizontal: layout.horizontal ?? "center",
      }}
      open={open}
      onClose={handleClose}
      autoHideDuration={duration}
      sx={{ height: layout.height ?? 5 }}
    >
      <SnackbarContent
        message={message}
        action={action}
        style={{
          backgroundColor: layout.backgroundColor ?? "#333",
          color: layout.color ?? "#fff",
        }}
      />
    </Snackbar>
  );
};

export default Toast;
