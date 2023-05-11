import { Box } from "@mui/material";
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
import BaseStylesProvider from "./BaseStylesProvider";
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

  return createPortal(
    <OperatorPalette
      dynamicWidth
      {...paletteProps}
      onClose={paletteProps.onCancel || operatorPrompt.close}
      submitOnControlEnter
    >
      {operatorPrompt.showPrompt && (
        <Prompting operatorPrompt={operatorPrompt} />
      )}
      {operatorPrompt.isExecuting && <div>Executing...</div>}
      {showResultOrError && (
        <ResultsOrError
          operatorPrompt={operatorPrompt}
          outputFields={operatorPrompt.outputFields}
        />
      )}
    </OperatorPalette>,
    document.body
  );
}

function Prompting({ operatorPrompt }) {
  return (
    <form onSubmit={operatorPrompt.onSubmit}>
      <OperatorIO
        schema={operatorPrompt.inputFields}
        onChange={(data) => {
          const formData = data;
          for (const field in formData) {
            operatorPrompt.setFieldValue(field, formData[field]);
          }
        }}
        data={operatorPrompt.promptingOperator.params}
        errors={operatorPrompt?.validationErrors || []}
      />
    </form>
  );
}

export function OperatorViewModal() {
  const io = useShowOperatorIO();
  if (!io.visible) return null;

  return createPortal(
    <OperatorPalette>
      <OperatorIO schema={io.schema} data={io.data || {}} type={io.type} />
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
    <Box>
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
