import OperatorPalette from "../OperatorPalette";
import OperatorPromptBody from "../components/OperatorPromptBody";
import { PaletteContentContainer } from "../styled-components";
import { OperatorPromptPropsType } from "../types";
import { getOperatorPromptConfigs } from "../utils";

export default function OperatorModalPrompt(props: OperatorPromptPropsType) {
  const { prompt } = props;
  const {
    title,
    hasValidationErrors,
    resolving,
    pendingResolve,
    validationErrorsStr,
    ...otherConfigs
  } = getOperatorPromptConfigs(prompt);
  return (
    <OperatorPalette
      {...otherConfigs}
      title={title}
      onClose={otherConfigs.onCancel || prompt.close}
      submitOnControlEnter
      disableSubmit={hasValidationErrors || resolving || pendingResolve}
      disabledReason={
        hasValidationErrors
          ? "Cannot execute operator with validation errors\n\n" +
            validationErrorsStr
          : "Cannot execute operator while validating form"
      }
      loading={resolving || pendingResolve}
    >
      <PaletteContentContainer>
        <OperatorPromptBody operatorPrompt={prompt} />
      </PaletteContentContainer>
    </OperatorPalette>
  );
}
