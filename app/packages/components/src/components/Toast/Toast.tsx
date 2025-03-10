import { Box, Snackbar, SnackbarContent } from "@mui/material";
import React from "react";
import { atom, useRecoilState } from "recoil";

interface ToastProps {
  message: React.ReactNode;
  primary?: any;
  secondary?: any;
  duration?: number;
  layout?: {
    vertical?: "top" | "bottom";
    horizontal?: "left" | "center" | "right";
    height?: number | string;
    top?: number | string;
    bottom?: number | string;
    backgroundColor?: string;
    color?: string;
    fontSize?: string;
    textAlign?: string;
  };
  onHandleClose?: (event, reason) => void;
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
  onHandleClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setOpen(false);
  },
}) => {
  const snackbarStyle = {
    height: layout?.height || 5,
    ...(layout?.top && {
      top: {
        xs: layout.top,
        sm: layout.top,
        md: layout.top,
        lg: layout.top,
        xl: layout.top,
      },
    }),
    ...(layout?.bottom && {
      bottom: {
        xs: layout.bottom,
        sm: layout.bottom,
        md: layout.bottom,
        lg: layout.bottom,
        xl: layout.bottom,
      },
    }),
  };

  const [open, setOpen] = useRecoilState(toastStateAtom); // State management for toast visibility

  const action = (
    <div>
      <Box display="flex" justifyContent="flex-end">
        {/* note: Not implemented within Python Panels context */}
        {primary && primary(setOpen)} {/* Pass setOpen to primary button */}
        {secondary && secondary(setOpen)}{" "}
        {/* Pass setOpen to secondary button */}
      </Box>
    </div>
  );

  return (
    <Snackbar
      anchorOrigin={{
        vertical: layout?.vertical || "bottom",
        horizontal: layout?.horizontal || "center",
      }}
      open={open}
      onClose={onHandleClose}
      autoHideDuration={duration}
      sx={snackbarStyle}
    >
      <SnackbarContent
        message={
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            gap={4}
          >
            <Box>{message}</Box>
            {action}
          </Box>
        }
        sx={{
          backgroundColor: layout?.backgroundColor || "#333",
          color: layout?.color || "#fff",
          fontSize: layout?.fontSize || "14px",
          display: "block",
          textAlign: layout?.textAlign || "left",
        }}
      />
    </Snackbar>
  );
};

export default Toast;
