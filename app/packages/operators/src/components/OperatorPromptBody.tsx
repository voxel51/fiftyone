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
  const { showResultOrError } = getOperatorPromptConfigs(operatorPrompt);

  return (
    <BaseStylesProvider>
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
