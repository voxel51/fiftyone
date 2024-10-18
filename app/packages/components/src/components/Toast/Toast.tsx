import React, { useState } from "react";
import { Snackbar, Button, SnackbarContent } from "@mui/material";

export default function Toast() {
  const [open, setOpen] = useState(false);
  const state = useToastState();

  return (
    <div>
      <Button variant="contained" onClick={handleClick}>
        Show Toast
      </Button>
      <Snackbar
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        open={state.open}
        onClose={handleClose}
        autoHideDuration={3000}
      >
        <SnackbarContent
          message={<span>{state.title}</span>}
          action={
            <Button
              color="secondary"
              size="small"
              onClick={state.buttonAction}
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
