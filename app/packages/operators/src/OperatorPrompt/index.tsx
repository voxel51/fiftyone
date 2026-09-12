import { createPortal } from "react-dom";
import { useRecoilValue } from "recoil";
import { showOperatorPromptSelector, useOperatorPrompt } from "../state";
import { BaseStylesProvider } from "../styled-components";
import { PromptArea } from "../types";
import { OPERATOR_PROMPT_AREAS } from "../constants";
import OperatorModalPrompt from "./OperatorModalPrompt";
import OperatorDrawerPrompt from "./OperatorDrawerPrompt";
import OperatorPopoverPrompt from "./OperatorPopoverPrompt";
import OperatorFullScreenPrompt from "./OperatorFullScreenPrompt";

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
  const target = getPromptTarget(prompt.promptView?.target);
  const Component = getPromptComponent(prompt.promptView?.target);

  return createPortal(<Component prompt={prompt} />, target);
}

const defaultTargetResolver = () => document.body;
const targetResolverByTarget = {
  [PromptArea.DrawerLeft]: () =>
    document.getElementById(OPERATOR_PROMPT_AREAS.DRAWER_LEFT),
  [PromptArea.DrawerRight]: () =>
    document.getElementById(OPERATOR_PROMPT_AREAS.DRAWER_RIGHT),
  [PromptArea.Popover]: () => document.body,
  [PromptArea.FullScreen]: () => document.body,
};
export function getPromptTarget(target: string | undefined) {
  const targetResolver =
    targetResolverByTarget[target] || defaultTargetResolver;
  return targetResolver();
}

const defaultPromptComponentResolver = () => OperatorModalPrompt;
const promptComponentByTarget = {
  [PromptArea.DrawerLeft]: () => OperatorDrawerPrompt,
  [PromptArea.DrawerRight]: () => OperatorDrawerPrompt,
  [PromptArea.Popover]: () => OperatorPopoverPrompt,
  [PromptArea.FullScreen]: () => OperatorFullScreenPrompt,
};
export function getPromptComponent(target: string | undefined) {
  const componentResolver =
    promptComponentByTarget[target] || defaultPromptComponentResolver;
  return componentResolver();
}
