import React, { useState } from "react";
import { Snackbar, Button, SnackbarContent } from "@mui/material";

export default function Toast() {
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    setOpen(true);
  };

  const handleClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setOpen(false);
  };

  return (
    <div>
      <Button variant="contained" onClick={handleClick}>
        Show Toast
      </Button>
      <Snackbar
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        open={open}
        onClose={handleClose}
        autoHideDuration={3000}
      >
        <SnackbarContent
          message={<span>Custom Text</span>}
          action={
            <Button
              color="secondary"
              size="small"
              onClick={handleClose}
              style={{ marginLeft: "auto" }} // Right align the button
            >
              CLOSE
            </Button>
          }
          style={{ backgroundColor: "#333", color: "#fff" }} // Custom styling for the Snackbar
        />
      </Snackbar>
    </div>
  );
}
