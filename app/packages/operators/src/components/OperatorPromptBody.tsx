import { Alert, AlertTitle } from "@mui/material";
import { useOperatorPrompt } from "../state";
import { BaseStylesProvider } from "../styled-components";
import { getOperatorPromptConfigs } from "../utils";
import OperatorFormExecuting from "./OperatorPromptExecuting";
import { OperatorPromptForm } from "./OperatorPromptForm";
import OperatorPromptOutput from "./OperatorPromptOutput";

export default function OperatorPromptBody(props: {
  operatorPrompt: OperatorPromptType;
}) {
  const { operatorPrompt } = props;
  const {
    showWarning,
    // warningTitle,
    warningMessage,
    showResultOrError,
  } = getOperatorPromptConfigs(operatorPrompt);
  const warningTitle = null; // todo

  return (
    <BaseStylesProvider>
      {showWarning && (
        <Alert severity="warning">
          <AlertTitle>{warningTitle}</AlertTitle>
          {warningMessage}
        </Alert>
      )}
      {operatorPrompt.showPrompt && (
        <OperatorPromptForm operatorPrompt={operatorPrompt} />
      )}
      {operatorPrompt.isExecuting && <OperatorFormExecuting />}
      {showResultOrError && (
        <OperatorPromptOutput
          operatorPrompt={operatorPrompt}
          outputFields={operatorPrompt.outputFields}
        />
      )}
    </BaseStylesProvider>
  );
}

type OperatorPromptType = ReturnType<typeof useOperatorPrompt>;
