import {
  Box,
  Dialog as MUIDialog,
  DialogProps as MUIDialogProps,
  IconButton,
  Grid,
  Typography,
  Button,
  CircularProgress,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

type DialogProps = Omit<MUIDialogProps, "open" | "title"> & {
  cancelButtonText?: string;
  confirmationButtonColor?: any;
  confirmationButtonText?: string;
  disableConfirmationButton?: boolean;
  hideActionButtons?: boolean;
  onCancel?: Function;
  onClose: Function;
  onConfirm?: Function;
  open?: boolean;
  loading?: boolean;
  title?: string | JSX.Element;
};

export default function Dialog(props: DialogProps) {
  const {
    cancelButtonText,
    children,
    confirmationButtonColor,
    confirmationButtonText,
    disableConfirmationButton,
    hideActionButtons,
    onCancel,
    onClose,
    onConfirm,
    open,
    title,
    loading,
    ...dialogProps
  } = props;
  return (
    <MUIDialog
      open={open}
      onClose={(e: any, reason: any) => onClose(e, reason)}
      {...dialogProps}
    >
      <Box padding={4}>
        <IconButton
          data-testid="close"
          aria-label="close"
          onClick={(e) => onClose(e, "escapeKeyDown")}
          sx={{ position: "absolute", right: 32 }}
        >
          <CloseIcon />
        </IconButton>
        {typeof title === "string" ? (
          <Typography variant="h6" sx={{ pb: 2, width: "95%" }} noWrap>
            {title}
          </Typography>
        ) : (
          title
        )}
        <Box>{children}</Box>
        {!hideActionButtons && (
          <Box
            paddingTop={2}
            sx={{
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <Button
              onClick={(e) => {
                if (onCancel) onCancel(e);
                // @ts-ignore
                onClose(e);
              }}
              variant="outlined"
            >
              {cancelButtonText || "Cancel"}
            </Button>
            <Button
              data-testid="dialog-confirm"
              onClick={(e) => {
                if (onConfirm) onConfirm(e);
              }}
              variant="contained"
              sx={{ marginLeft: 2 }}
              color={confirmationButtonColor}
              disabled={disableConfirmationButton}
            >
              {confirmationButtonText || "Confirm"}
              {loading && (
                <CircularProgress size={16} sx={{ position: "absolute" }} />
              )}
            </Button>
          </Box>
        )}
      </Box>
    </MUIDialog>
  );
}
