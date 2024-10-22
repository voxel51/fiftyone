import React from "react";
import { atom, useRecoilState } from "recoil";
import { Snackbar, SnackbarContent } from "@mui/material";

// Define types for the props
interface ToastProps {
  message: React.ReactNode;
  primary: CallableFunction;
  secondary: CallableFunction;
  duration?: number;         // Optional duration, with a default value
}

const Toast: React.FC<ToastProps> = ({message, primary, secondary, duration = 5000 }) => {
  const toastStateAtom = atom({
    key: "open",
    default: true,
  });

  const [open, setOpen] = useRecoilState(toastStateAtom); // State management for toast visibility

  const handleClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setOpen(false);
  };

  const action = (
    <div>
      {primary(setOpen)} {/* Pass setOpen to primary button */}
      {secondary(setOpen)} {/* Pass setOpen to secondary button */}
    </div>
  );

  return (
    <Snackbar
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      open={open}
      onClose={handleClose}
      autoHideDuration={duration}
      sx={{ height: 5 }}
    >
      <SnackbarContent
        message={message}
        action={action}
        style={{ backgroundColor: "#333", color: "#fff" }}
      />
    </Snackbar>
  );
}

export default Toast;
