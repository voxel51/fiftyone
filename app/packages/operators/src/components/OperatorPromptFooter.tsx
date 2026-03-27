import { Button } from "@fiftyone/components";
import { CircularProgress, Link, Stack } from "@mui/material";
import {
  IconName,
  RichCard,
  Variant,
  Button as VoodoButton,
} from "@voxel51/voodo";
import { useCallback } from "react";
import { SubmitButtonOption } from "../OperatorPalette";
import SplitButton from "../SplitButton";
import { BaseStylesProvider } from "../styled-components";
import { onEnter } from "../utils";

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
        <RichCard
          title="Background compute is not yet configured"
          description="Production workflows require dedicated compute resources."
          icon={IconName.Orchestrator}
          compact
          action={
            <Link
              href="https://docs.voxel51.com/plugins/using_plugins.html#delegated-operations"
              target="_blank"
            >
              <VoodoButton variant={Variant.Secondary}>Set up now</VoodoButton>
            </Link>
          }
        />
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
