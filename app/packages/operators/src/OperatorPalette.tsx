import { scrollable } from "@fiftyone/components";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogProps,
  DialogTitle,
} from "@mui/material";
import {
  PropsWithChildren,
  ReactElement,
  useCallback,
  useEffect,
  useRef,
} from "react";
import OperatorPromptFooter from "./components/OperatorPromptFooter";
import OperatorPromptHeader from "./components/OperatorPromptHeader";
import { PALETTE_CONTROL_KEYS } from "./constants";

export default function OperatorPalette(props: OperatorPaletteProps) {
  const paletteElem = useRef<HTMLDivElement>(null);
  const {
    children,
    onSubmit,
    onCancel,
    onClose,
    onOutsideClick,
    allowPropagation,
    submitOnControlEnter,
    title,
    dialogProps,
  } = props;
  const hideActions = !onSubmit && !onCancel;
  const scroll = "paper";
  const keyDownHandler = useCallback(
    (event) => {
      const { key } = event;
      if (PALETTE_CONTROL_KEYS.includes(key) && !allowPropagation) {
        event.stopPropagation();
      }
      switch (key) {
        case "Escape":
          if (onClose) onClose();
          if (onCancel) onCancel();
          break;
        case "Enter":
          if (
            onSubmit &&
            (event.metaKey || event.ctrlKey || !submitOnControlEnter)
          )
            onSubmit();
          break;
        default:
          break;
      }
    },
    [onClose, onCancel, onSubmit, allowPropagation, submitOnControlEnter]
  );

  useEffect(() => {
    document.addEventListener("keydown", keyDownHandler);
    return () => {
      document.removeEventListener("keydown", keyDownHandler);
    };
  }, [paletteElem, keyDownHandler]);

  return (
    <Dialog
      {...dialogProps}
      open
      onClose={onClose || onOutsideClick}
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
  allowPropagation?: boolean;
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
};
