import styled from "styled-components";
import BaseStylesProvider from "./BaseStylesProvider";
import { Button } from "@fiftyone/components";
import {
  PropsWithChildren,
  ReactElement,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { scrollbarStyles } from "@fiftyone/utilities";
import { useOutsideClick } from "@fiftyone/state";
import { PALETTE_CONTROL_KEYS } from "./constants";
import { onEnter } from "./utils";

import Dialog, { DialogProps } from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

export default function OperatorPalette(props: OperatorPaletteProps) {
  const paletteElem = useRef<HTMLDivElement>(null);
  const {
    children,
    onSubmit,
    onCancel,
    onClose,
    submitButtonText = "Execute",
    cancelButtonText = "Cancel",
    dynamicWidth,
    onOutsideClick,
    allowPropagation,
    submitOnControlEnter,
    title,
  } = props;
  const hideActions = !onSubmit && !onCancel;
  const scroll = "paper";

  useOutsideClick(paletteElem, (e) => {
    const { top, bottom, left, right } =
      paletteElem.current.getBoundingClientRect();
    if (e.x < left || e.x >= right || e.y < top || e.y > bottom) {
      if (onOutsideClick) onOutsideClick();
      if (onClose) onClose();
    }
  });

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

  useEffect(() => {
    document.addEventListener("keydown", keyDownHandler);
    return () => {
      document.removeEventListener("keydown", keyDownHandler);
    };
  }, [paletteElem, keyDownHandler]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      scroll={scroll}
      maxWidth="lg"
      aria-labelledby="scroll-dialog-title"
      aria-describedby="scroll-dialog-description"
    >
      <DialogTitle id="scroll-dialog-title">{title}</DialogTitle>
      <DialogContent dividers={scroll === "paper"}>
        <DialogContentText id="scroll-dialog-description" tabIndex={-1}>
          {children}
        </DialogContentText>
      </DialogContent>
      {!hideActions && (
        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button onClick={onSubmit}>{submitButtonText}</Button>
        </DialogActions>
      )}
    </Dialog>
  );

  return (
    <BaseStylesProvider>
      <PaletteContainer>
        <PaletteContentContainer>
          <PaletteContent dynamicWidth={dynamicWidth} ref={paletteElem}>
            <PaletteBody fullHeight={hideActions}>{children}</PaletteBody>
            <PaletteFooter hidden={hideActions}>
              {!hideActions && (
                <ButtonsContainer>
                  {onCancel && (
                    <Button
                      onClick={onCancel}
                      style={{ marginRight: "8px" }}
                      onKeyDown={onEnter(onCancel)}
                    >
                      {cancelButtonText}
                    </Button>
                  )}
                  {onSubmit && (
                    <Button onClick={onSubmit} onKeyDown={onEnter(onSubmit)}>
                      {submitButtonText}
                    </Button>
                  )}
                </ButtonsContainer>
              )}
            </PaletteFooter>
          </PaletteContent>
        </PaletteContentContainer>
      </PaletteContainer>
    </BaseStylesProvider>
  );
}

const PaletteContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  justify-content: center;
  align-items: flex-start;
  z-index: 1000;
`;

const PaletteContentContainer = styled.div`
  max-height: calc(100% - 10rem);
  margin-top: 5rem;
  display: flex;
  justify-content: center;
`;

const PaletteContent = styled.div<{ dynamicWidth: boolean }>`
  padding: 1rem;
  padding-right: 0;
  background: ${({ theme }) => theme.background.level2};
  overflow: auto;
  width: ${({ dynamicWidth }) => (dynamicWidth ? "auto" : "50%")};
  max-width: ${({ dynamicWidth }) => (dynamicWidth ? "80%" : "unset")};
  min-width: ${({ dynamicWidth }) => (dynamicWidth ? "50%" : "unset")};
  align-self: stretch;
  display: flex;
  flex-direction: column;
`;

const PaletteBody = styled.div<{ fullHeight: boolean }>`
  max-height: ${({ fullHeight }) =>
    fullHeight ? "100%" : "calc(100% - 38px)"};
  overflow: auto;
  ${scrollbarStyles}
`;

const PaletteFooter = styled.div<{ hidden: boolean }>`
  padding-top: ${({ hidden }) => (hidden ? 0 : "12px")};
  padding-right: 1rem;
`;

const ButtonsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
`;

export type OperatorPaletteProps = PropsWithChildren & {
  onSubmit?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
  onOutsideClick?: () => void;
  submitButtonText?: string;
  cancelButtonText?: string;
  dynamicWidth?: boolean;
  allowPropagation?: boolean;
  submitOnControlEnter?: boolean;
  title?: ReactElement;
};
