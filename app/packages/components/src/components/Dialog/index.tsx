import React from "react";
import {
  DialogProps as MuiDialogProps,
  IconButton,
  Dialog as MuiDialog,
} from "@mui/material";
import { Close } from "@mui/icons-material";

export default function Dialog(props: DialogProps) {
  const { children, PaperProps, onClose, ...otherProps } = props;
  return (
    <MuiDialog
      PaperProps={{
        ...PaperProps,
        sx: {
          backgroundImage: "none",
          backgroundColor: (theme) => theme.palette.background.level1,
          padding: 0.5,
          minWidth: 450,
          ...(PaperProps?.sx || {}),
        },
      }}
      onClose={onClose}
      {...otherProps}
    >
      <IconButton
        onClick={() => {
          if (onClose) {
            onClose({}, "closeButtonClick");
          }
        }}
        sx={{ position: "absolute", top: 8, right: 8 }}
      >
        <Close />
      </IconButton>
      {children}
    </MuiDialog>
  );
}

type DialogProps = Omit<MuiDialogProps, "onClose"> & {
  onClose?: (
    event: {},
    reason: "backdropClick" | "escapeKeyDown" | "closeButtonClick"
  ) => void;
};
