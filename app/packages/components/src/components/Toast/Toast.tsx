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

const Toast: React.FC<ToastProps> = ({ action, message, duration = 3000 }) => {
  const [open, setOpen] = useState(true);

  const handleClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setOpen(false);
  };

  return (
    <div>
      <Snackbar
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        open={open}
        onClose={handleClose}
        autoHideDuration={30000}
        sx={{ height: 5 }}
      >
        <SnackbarContent
          message={message}
          action={action}
          style={{ backgroundColor: "#333", color: "#fff" }} // Custom styling for the Snackbar
        />
      </Snackbar>
    </div>
  );
}

export default Toast;
