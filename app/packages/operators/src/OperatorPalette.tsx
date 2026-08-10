import { scrollable } from "@fiftyone/components";
import { useDismissable, useKeyBinding } from "@fiftyone/keymap";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogProps,
  DialogTitle,
} from "@mui/material";
import { PropsWithChildren, ReactElement, useRef } from "react";
import OperatorPromptFooter from "./components/OperatorPromptFooter";
import OperatorPromptHeader from "./components/OperatorPromptHeader";

export default function OperatorPalette(props: OperatorPaletteProps) {
  const paletteElem = useRef<HTMLDivElement>(null);
  const {
    children,
    onSubmit,
    onCancel,
    onClose,
    onOutsideClick,
    isExecuting,
    submitOnControlEnter,
    title,
    dialogProps,
  } = props;
  const hideActions = !onSubmit && !onCancel;
  const scroll = "paper";
  // The palette is a dismissal layer: Escape closes and cancels it, and nothing
  // behind it also sees that press. The `allowPropagation` prop and the manual
  // `stopPropagation()` over `PALETTE_CONTROL_KEYS` were both standing in for
  // arbitration the bus now does — a consumed key is suppressed for everyone.
  useDismissable(
    "operator-palette",
    "Operator palette",
    "overlay.dialog",
    () => {
      if (!onClose && !onCancel) {
        return false;
      }
      onClose?.();
      onCancel?.();
      return true;
    },
  );

  // Enter, or Control/Command+Enter where the palette asks for it. The modifier
  // check stays in the handler because both spellings are one command — the
  // pane should offer one row to rebind, not two.
  useKeyBinding(
    "fo.operator-palette.submit",
    (event) => {
      if (event.metaKey || event.ctrlKey || !submitOnControlEnter) {
        onSubmit?.();
      }
    },
    { enablement: () => Boolean(onSubmit) },
  );

  const handleClose = (
    _event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    reason: "escapeKeyDown" | "backdropClick",
  ) => {
    // Prevent closing if an action is in progress
    if (isExecuting) return;

    switch (reason) {
      case "escapeKeyDown":
      case "backdropClick":
        if (onOutsideClick) {
          onOutsideClick();
        } else if (onClose) {
          onClose();
        }
        break;
      default:
        onClose?.();
    }
  };

  return (
    <Dialog
      {...dialogProps}
      open
      onClose={handleClose}
      scroll={scroll}
      maxWidth={false}
      aria-labelledby=""
      aria-describedby="scroll-dialog-description"
      PaperProps={{
        ...(dialogProps?.PaperProps || {}),
        sx: { backgroundImage: "none" },
      }}
      sx={{
        "& .MuiDialog-container": {
          alignItems: "flex-start",
        },
        zIndex: (theme) => theme.zIndex.operatorPalette,
      }}
    >
      {title && (
        <DialogTitle component="div" sx={{ p: 1 }}>
          <OperatorPromptHeader title={title} />
        </DialogTitle>
      )}
      <DialogContent
        dividers={scroll === "paper"}
        className={scrollable}
        sx={{
          p: 1,
          ...(hideActions ? { borderBottom: "none" } : {}),
          ...(title ? {} : { borderTop: "none" }),
        }}
      >
        {children}
      </DialogContent>
      {!hideActions && (
        <DialogActions sx={{ p: 1 }}>
          <OperatorPromptFooter {...props} />
        </DialogActions>
      )}
    </Dialog>
  );
}

export type SubmitButtonOption = {
  id: string;
  label: string;
};

export type OperatorPaletteProps = PropsWithChildren & {
  onSubmit?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
  onOutsideClick?: () => void;
  submitButtonText?: string;
  cancelButtonText?: string;
  maxWidth?: DialogProps["maxWidth"];
  submitOnControlEnter?: boolean;
  title?: ReactElement;
  disableSubmit?: boolean;
  disabledReason?: string;
  loading?: boolean;
  submitButtonOptions?: SubmitButtonOption[];
  hasSubmitButtonOptions?: boolean;
  submitOptionsLoading?: boolean;
  showWarning?: boolean;
  warningTitle?: string;
  warningMessage?: string;
  dialogProps?: Omit<DialogProps, "open">;
  isExecuting?: boolean;
};
