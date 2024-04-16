import { createPortal } from "react-dom";
import { useRecoilValue } from "recoil";
import { showOperatorPromptSelector, useOperatorPrompt } from "../state";
import { BaseStylesProvider } from "../styled-components";
import { getPromptComponent, getPromptTarget } from "../utils";

export default function OperatorPrompt() {
  const show = useRecoilValue(showOperatorPromptSelector);
  if (show) {
    return (
      <BaseStylesProvider>
        <DynamicOperatorPrompt />
      </BaseStylesProvider>
    );
  } else {
    return null;
  }
}

function DynamicOperatorPrompt() {
  const prompt = useOperatorPrompt();
  const target = getPromptTarget(prompt);
  const Component = getPromptComponent(prompt);

  if (!prompt.resolvedIO.input && !prompt.resolvedIO.output) return null;

  return createPortal(<Component prompt={prompt} />, target);
}
