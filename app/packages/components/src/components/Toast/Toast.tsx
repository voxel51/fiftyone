import React, { useState } from "react";
import { Button, Snackbar, SnackbarContent } from "@mui/material";

// Define types for the props
interface ToastProps {
  message: React.ReactNode;  // Accepts any valid React component, element, or JSX
  primary: Button;           // Accepts a Button component
  secondary: Button;          // Accepts a Button component
  duration?: number;         // Optional duration, with a default value
}

const Toast: React.FC<ToastProps> = ({message, primary, secondary, duration = 5000 }) => {
  const [open, setOpen] = useState(true);

  const handleClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setOpen(false);
  };

  const action = (
  <div>
    {primary}
    {secondary}
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
