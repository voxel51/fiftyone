import { createPortal } from "react-dom";
import { useRecoilValue } from "recoil";
import { showOperatorPromptSelector, useOperatorPrompt } from "../state";
import { BaseStylesProvider } from "../styled-components";
import { OperatorPromptType } from "../types";
import OperatorModalPrompt from "./OperatorModalPrompt";
import OperatorDrawerPrompt from "./OperatorDrawerPrompt";
import { OPERATOR_PROMPT_AREAS } from "../constants";

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

const defaultTargetResolver = () => document.body;
const targetResolverByName = {
  DrawerView: (promptView: OperatorPromptType["promptView"]) => {
    const promptArea =
      promptView.placement === "left"
        ? OPERATOR_PROMPT_AREAS.DRAWER_LEFT
        : OPERATOR_PROMPT_AREAS.DRAWER_RIGHT;
    return document.getElementById(promptArea);
  },
};
export function getPromptTarget(operatorPrompt: OperatorPromptType) {
  const { promptView } = operatorPrompt;
  const targetResolver =
    targetResolverByName[promptView?.name] || defaultTargetResolver;
  return targetResolver(promptView);
}

const defaultPromptComponentResolver = () => OperatorModalPrompt;
const promptComponentByName = {
  DrawerView: () => OperatorDrawerPrompt,
};
export function getPromptComponent(operatorPrompt: OperatorPromptType) {
  const { promptView } = operatorPrompt;
  const targetResolver =
    promptComponentByName[promptView?.name] || defaultPromptComponentResolver;
  return targetResolver(promptView);
}
