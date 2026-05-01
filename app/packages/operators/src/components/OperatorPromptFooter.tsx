import { Button } from "@fiftyone/components";
import { CircularProgress, Stack } from "@mui/material";
import { useCallback } from "react";
import { SubmitButtonOption } from "../OperatorPalette";
import SplitButton from "../SplitButton";
import { BaseStylesProvider } from "../styled-components";
import { onEnter } from "../utils";
import RequiresOrchestrator from "./RequiresOrchestrator";

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
    requiresOrchestratorSetup,
  } = props;

  const handleSubmit = useCallback(() => {
    if (disableSubmit) return;
    onSubmit();
  }, [disableSubmit, onSubmit]);

  if (requiresOrchestratorSetup) {
    return (
      <Stack sx={{ width: "100%", gap: 2 }}>
        <RequiresOrchestrator />
        <Stack justifyContent="flex-end" direction="row">
          <Button onClick={onCancel} onKeyDown={onEnter(onCancel)}>
            Close
          </Button>
        </Stack>
      </Stack>
    );
  }

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

type OperatorFooterProps = {
  onSubmit?: () => void;
  onCancel?: () => void;
  submitButtonText?: string;
  cancelButtonText?: string;
  disableSubmit?: boolean;
  disabledReason?: string;
  loading?: boolean;
  submitButtonOptions?: SubmitButtonOption[];
  hasSubmitButtonOptions?: boolean;
  submitOptionsLoading?: boolean;
  requiresOrchestratorSetup?: boolean;
};
