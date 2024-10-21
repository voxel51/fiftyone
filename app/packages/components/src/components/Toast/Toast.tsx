import React, { useState } from "react";
import { Snackbar, Button, SnackbarContent } from "@mui/material";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import BoltIcon from '@mui/icons-material/Bolt'; // Icon for the lightning bolt

// Define types for the props
interface ToastProps {
  action: React.ReactNode;   // Accepts any valid React component, element, or JSX
  message: React.ReactNode;  // Accepts any valid React component, element, or JSX
  duration?: number;         // Optional duration, with a default value
}

const Toast: React.FC<ToastProps> = ({ action, message, duration = 5000 }) => {
  const [open, setOpen] = useState(true);

  const handleClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setOpen(false);
  };

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
