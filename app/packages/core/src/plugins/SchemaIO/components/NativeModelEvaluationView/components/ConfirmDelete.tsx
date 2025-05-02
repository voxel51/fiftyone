import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import React from "react";

export default function ConfirmDelete(props: ConfirmDeleteProps) {
  const { open, onClose, onDelete, heading, body } = props;

  return (
    <Dialog open={open} fullWidth onClose={onClose}>
      <DialogTitle>{heading}</DialogTitle>
      <DialogContent>{body}</DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => {
            onClose();
            onDelete?.();
          }}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type ConfirmDeleteProps = {
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
  heading?: string | React.ReactNode;
  body?: string | React.ReactNode;
};
