import React, { useState } from "react";
import { Box, Snackbar, SnackbarContent } from "@mui/material";

export default function ToastView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { message, duration, layout } = view;

  return (
    <Toast
      message={message}
      duration={duration}
      layout={layout}
      key={view.key ?? "toast"}
    />
  );
}

interface ToastProps {
  message: React.ReactNode;
  primary?: (setOpen: (open: boolean) => void) => React.ReactNode;
  secondary?: (setOpen: (open: boolean) => void) => React.ReactNode;
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
  onHandleClose?: (
    event: React.SyntheticEvent<any> | Event,
    reason?: string
  ) => void;
}

const Toast: React.FC<ToastProps> = ({
  message,
  primary,
  secondary,
  duration = 5000,
  layout = {},
  onHandleClose,
}) => {
  const [open, setOpen] = useState(true); // do not use a global recoil atom for this state

  const handleClose = (
    event: React.SyntheticEvent<any> | Event,
    reason?: string
  ) => {
    if (reason === "clickaway") {
      return;
    }
    setOpen(false);

    if (onHandleClose) {
      onHandleClose(event, reason);
    }
  };

  const snackbarStyle = {
    height: layout?.height || 5,
    ...(layout?.top && { top: layout.top }),
    ...(layout?.bottom && { bottom: layout.bottom }),
  };

  const action = (
    <Box display="flex" justifyContent="flex-end">
      {primary && primary(setOpen)} {/* Pass setOpen to primary button */}
      {secondary && secondary(setOpen)} {/* Pass setOpen to secondary button */}
    </Box>
  );

  return (
    <Snackbar
      anchorOrigin={{
        vertical: layout?.vertical || "bottom",
        horizontal: layout?.horizontal || "center",
      }}
      open={open}
      onClose={handleClose}
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
