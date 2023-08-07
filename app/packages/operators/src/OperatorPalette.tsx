import { Button } from "@fiftyone/components";
import {
  PropsWithChildren,
  ReactElement,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { BaseStylesProvider } from "./styled-components";
import { PALETTE_CONTROL_KEYS } from "./constants";

import { scrollable } from "@fiftyone/components";
import {
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  DialogProps,
} from "@mui/material";
import { onEnter } from "./utils";

export default function OperatorPalette(props: OperatorPaletteProps) {
  const paletteElem = useRef<HTMLDivElement>(null);
  const {
    children,
    onSubmit,
    onCancel,
    onClose,
    submitButtonText = "Execute",
    cancelButtonText = "Cancel",
    onOutsideClick,
    allowPropagation,
    submitOnControlEnter,
    title,
    disableSubmit,
    disabledReason,
    loading,
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
        case "`":
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

  const handleSubmit = useCallback(() => {
    if (disableSubmit) return;
    onSubmit();
  }, [disableSubmit, onSubmit]);

  useEffect(() => {
    document.addEventListener("keydown", keyDownHandler);
    return () => {
      document.removeEventListener("keydown", keyDownHandler);
    };
  }, [paletteElem, keyDownHandler]);

  return (
    <Dialog
      open
      onClose={onClose || onOutsideClick}
      scroll={scroll}
      maxWidth={false}
      aria-labelledby=""
      aria-describedby="scroll-dialog-description"
      PaperProps={{ sx: { backgroundImage: "none" } }}
      sx={{
        "& .MuiDialog-container": {
          alignItems: "flex-start",
        },
      }}
    >
      {title && (
        <DialogTitle component="div" sx={{ p: 1 }}>
          <BaseStylesProvider>{title}</BaseStylesProvider>
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
        <BaseStylesProvider>{children}</BaseStylesProvider>
      </DialogContent>
      {!hideActions && (
        <DialogActions sx={{ p: 1 }}>
          {loading && (
            <CircularProgress
              size={20}
              sx={{ mr: 1, color: (theme) => theme.palette.text.secondary }}
            />
          )}
          {onCancel && (
            <BaseStylesProvider>
              <Button onClick={onCancel} onKeyDown={onEnter(onCancel)}>
                {cancelButtonText}
              </Button>
            </BaseStylesProvider>
          )}
          {onSubmit && (
            <BaseStylesProvider>
              <Button
                onClick={handleSubmit}
                onKeyDown={onEnter(handleSubmit)}
                disabled={disableSubmit}
                title={disableSubmit && disabledReason}
              >
                {submitButtonText}
              </Button>
            </BaseStylesProvider>
          )}
        </DialogActions>
      )}
    </Dialog>
  );
}

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
};
