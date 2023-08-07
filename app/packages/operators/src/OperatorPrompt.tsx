import { Box, LinearProgress, Typography } from "@mui/material";
import { useCallback } from "react";
import { createPortal } from "react-dom";
import { useRecoilValue } from "recoil";
import OperatorIO from "./OperatorIO";
import {
  showOperatorPromptSelector,
  useOperatorPrompt,
  useShowOperatorIO,
} from "./state";
// todo: use plugin component
import ErrorView from "../../core/src/plugins/SchemaIO/components/ErrorView";
import {
  BaseStylesProvider,
  PaletteContentContainer,
} from "./styled-components";
import OperatorPalette, { OperatorPaletteProps } from "./OperatorPalette";
import { stringifyError } from "./utils";

export default function OperatorPrompt() {
  const show = useRecoilValue(showOperatorPromptSelector);
  if (show) {
    return (
      <BaseStylesProvider>
        <ActualOperatorPrompt />
      </BaseStylesProvider>
    );
  } else {
    return null;
  }
}

function ActualOperatorPrompt() {
  const operatorPrompt = useOperatorPrompt();
  const showResultOrError =
    operatorPrompt.hasResultOrError ||
    operatorPrompt.executorError ||
    operatorPrompt.resolveError;

  const paletteProps: OperatorPaletteProps = {
    submitButtonText: "Execute",
    cancelButtonText: "Cancel",
  };

  if (operatorPrompt.showPrompt) {
    paletteProps.onSubmit = operatorPrompt.execute;
    paletteProps.onCancel = operatorPrompt.cancel;
  } else if (showResultOrError) {
    paletteProps.onCancel = operatorPrompt.close;
    paletteProps.cancelButtonText = "Close";
  }

  const title = getPromptTitle(operatorPrompt);
  const hasValidationErrors = operatorPrompt.validationErrors?.length > 0;
  const { resolving, pendingResolve } = operatorPrompt;

  return createPortal(
    <OperatorPalette
      title={title}
      {...paletteProps}
      onClose={paletteProps.onCancel || operatorPrompt.close}
      submitOnControlEnter
      disableSubmit={hasValidationErrors || resolving || pendingResolve}
      disabledReason={
        hasValidationErrors
          ? "Cannot execute operator with validation errors"
          : "Cannot execute operator while validating form"
      }
      loading={resolving || pendingResolve}
    >
      <PaletteContentContainer>
        {operatorPrompt.showPrompt && (
          <Prompting operatorPrompt={operatorPrompt} />
        )}
        {operatorPrompt.isExecuting && <Executing />}
        {showResultOrError && (
          <ResultsOrError
            operatorPrompt={operatorPrompt}
            outputFields={operatorPrompt.outputFields}
          />
        )}
      </PaletteContentContainer>
    </OperatorPalette>,
    document.body
  );
}

function Executing() {
  return (
    <Box>
      <LinearProgress />
      <Typography sx={{ pt: 1, textAlign: "center" }}>Executing...</Typography>
    </Box>
  );
}

function Prompting({ operatorPrompt }) {
  const setFormState = useCallback((data) => {
    const formData = data;
    for (const field in formData) {
      operatorPrompt.setFieldValue(field, formData[field]);
    }
  }, []);

  return (
    <Box component={"form"} p={2} onSubmit={operatorPrompt.onSubmit}>
      <OperatorIO
        schema={operatorPrompt.inputFields}
        onChange={setFormState}
        data={operatorPrompt.promptingOperator.params}
        errors={operatorPrompt?.validationErrors || []}
      />
    </Box>
  );
}

export function OperatorViewModal() {
  const io = useShowOperatorIO();
  if (!io.visible) return null;

  return createPortal(
    <OperatorPalette
      onSubmit={io.hide}
      onClose={io.hide}
      submitButtonText="Done"
    >
      <PaletteContentContainer>
        <OperatorIO schema={io.schema} data={io.data || {}} type={io.type} />
      </PaletteContentContainer>
    </OperatorPalette>,
    document.body
  );
}

function ResultsOrError({ operatorPrompt, outputFields }) {
  const executorError = operatorPrompt?.executorError;
  const resolveError = operatorPrompt?.resolveError;
  const error = resolveError || executorError;
  if (!outputFields && !executorError && !resolveError) return null;
  const { result } = operatorPrompt.executor;

  return (
    <Box p={2}>
      {outputFields && (
        <OperatorIO
          type="output"
          data={result}
          schema={operatorPrompt.outputFields}
          onChange={() => {}}
        />
      )}
      {error && (
        <ErrorView
          schema={{ view: { detailed: true } }}
          data={[
            {
              reason: "Error occurred during operator execution",
              details: stringifyError(error),
            },
          ]}
        />
      )}
    </Box>
  );
}

function getPromptTitle(operatorPrompt) {
  const definition = operatorPrompt.showPrompt
    ? operatorPrompt?.inputFields
    : operatorPrompt?.outputFields;
  return definition?.view?.label;
}
