import { ComponentType, ReactElement } from "react";
import { createPortal } from "react-dom";
import { useRecoilValue } from "recoil";
import OperatorIO from "./OperatorIO";
import {
  showOperatorPromptSelector,
  useOperatorPrompt,
  useShowOperatorIO,
} from "./state";
import {
  BaseStylesProvider,
  PaletteContentContainer,
} from "./styled-components";
import OperatorPalette from "./OperatorPalette";
import { getOperatorPromptConfigs } from "./utils";
import { CUSTOM_PROMPTS } from "./constants";
import OperatorPromptBody from "./components/OperatorPromptBody";

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

export function withOperatorPrompt(Component: ComponentType) {
  return function WithOperatorPrompt(props) {
    const show = useRecoilValue(showOperatorPromptSelector);
    if (show) {
      return <Component {...props} />;
    }
    return null;
  };
}

function ActualOperatorPrompt() {
  const operatorPrompt = useOperatorPrompt();
  const {
    title,
    hasValidationErrors,
    resolving,
    pendingResolve,
    validationErrorsStr,
    show,
    customPromptName,
    ...otherConfigs
  } = getOperatorPromptConfigs(operatorPrompt);

  if (CUSTOM_PROMPTS.includes(customPromptName) || !show) return null;

  return createPortal(
    <OperatorPalette
      {...otherConfigs}
      title={title}
      onClose={otherConfigs.onCancel || operatorPrompt.close}
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
        <OperatorPromptBody operatorPrompt={operatorPrompt} />
      </PaletteContentContainer>
    </OperatorPalette>,
    document.body
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

function getPromptTitle(operatorPrompt) {
  const definition = operatorPrompt.showPrompt
    ? operatorPrompt?.inputFields
    : operatorPrompt?.outputFields;
  return definition?.view?.label;
}
