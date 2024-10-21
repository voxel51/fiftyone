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

  const handleClick = () => {
    setOpen(true);
  };

  const handleClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setOpen(false);
  };

  // example of action; we can restrict the prop to only have a primary action and secondary action (label, variant and function)
  action = (
    <div>
      <Button
              variant="contained"
              size="small"
              onClick={handleClose}
              style={{ marginLeft: "auto" }} // Right align the button
            >
              Create an index
            </Button>
       <Button
              variant="text"
              color="secondary"
              size="small"
              onClick={handleClose}
              style={{ marginLeft: "auto" }} // Right align the button
            >
              Don't show me again
            </Button>
    </div>
);

  // example of message; we can also restrict the message to just be title and description
  // title (optional) can be a react node or string
  // description is string
  // make these div into a component like the button
  // snackbar message => component
  // snackbar action => component (primary, secondary)
  message = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        border: '1px dashed #90caf9',
        borderRadius: '4px',
        padding: '8px',
        width: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <BoltIcon sx={{ color: '#f5b700', marginRight: '8px' }} />
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 500, marginRight: '8px' }}
        >
          Query Performance is Available!
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: '#fff',
            borderRadius: '2px',
            padding: '2px 4px',
            fontWeight: 600,
          }}
        >
          NEW
        </Typography>
      </Box>
      <br/>
      <Typography variant="body2" sx={{ color: '#757575' }}>
        Index the most critical fields for faster data loading and query performance.
      </Typography>
    </Box>
);

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
