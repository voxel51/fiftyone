import { Button } from "@fiftyone/components";
import { CircularProgress, Button as MUIButton } from "@mui/material";
import { useCallback } from "react";
import SplitButton from "../SplitButton";
import { BaseStylesProvider } from "../styled-components";
import { onEnter } from "../utils";
import { SubmitButtonOption } from "../OperatorPalette";

export default function OperatorPromptFooter(props: OperatorFooterProps) {
  const {
    onSubmit,
    onCancel,
    submitButtonText = "Execute",
    cancelButtonText = "Cancel",
    disableSubmit,
    disabledReason,
    loading,
    submitButtonOptions,
    submitOptionsLoading,
    hasSubmitButtonOptions,
    showWarning,
  } = props;

  const handleSubmit = useCallback(() => {
    if (disableSubmit) return;
    onSubmit();
  }, [disableSubmit, onSubmit]);

  if (showWarning) {
    return (
      <MUIButton
        sx={{ textTransform: "none" }}
        onClick={onCancel}
        onKeyDown={onEnter(onCancel)}
      >
        OK
      </MUIButton>
    );
  }

  if (!showWarning) {
    return (
      <>
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
        {onSubmit && !hasSubmitButtonOptions && !submitOptionsLoading && (
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
        {onSubmit && hasSubmitButtonOptions && !submitOptionsLoading && (
          <BaseStylesProvider>
            <SplitButton
              disabled={disableSubmit}
              disabledReason={disabledReason}
              options={submitButtonOptions}
              submitOnEnter
              onSubmit={onSubmit}
            />
          </BaseStylesProvider>
        )}
      </>
    );
  }

  return null;
}

type OperatorFooterProps = {
  onSubmit?: () => void;
  onCancel?: () => void;
  submitButtonText?: string;
  cancelButtonText?: string;
  disableSubmit?: boolean;
  disabledReason?: string;
  loading?: boolean;
  submitButtonOptions: SubmitButtonOption[];
  hasSubmitButtonOptions: boolean;
  submitOptionsLoading: boolean;
  showWarning?: boolean;
};
