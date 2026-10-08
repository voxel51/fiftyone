import { Close } from "@mui/icons-material";
import {
  IconButton,
  Dialog as MuiDialog,
  DialogProps as MuiDialogProps,
} from "@mui/material";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
export default function Dialog(props: DialogProps) {
  const { children, PaperProps, onClose, hideCloseButton, ...otherProps } =
    props;
  return (
    <MuiDialog
      PaperProps={{
        ...PaperProps,
        sx: { padding: 0.5, minWidth: 450, ...(PaperProps?.sx || {}) },
      }}
      onClose={onClose}
      {...otherProps}
    >
      {!hideCloseButton && (
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
      )}
      {children}
    </MuiDialog>
  );
}

type DialogProps = Omit<MuiDialogProps, "onClose"> & {
  onClose?: (
    event: unknown,
    reason: "backdropClick" | "escapeKeyDown" | "closeButtonClick",
  ) => void;
  /** For dialogs that render their own close control in a header */
  hideCloseButton?: boolean;
};
