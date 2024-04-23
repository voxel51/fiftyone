import { getFetchParameters } from "@fiftyone/utilities";
import { KeyboardEventHandler } from "react";
import { OPERATOR_PROMPT_AREAS, types } from ".";
import OperatorDrawerPrompt from "./OperatorPrompt/OperatorDrawerPrompt";
import OperatorModalPrompt from "./OperatorPrompt/OperatorModalPrompt";
import { ValidationErrorsType, OperatorPromptType } from "./types";

export function stringifyError(error, fallback?) {
  if (typeof error === "string") return error;
  return (
    error?.stack ||
    error?.bodyResponse?.error?.message ||
    error?.bodyResponse?.stack ||
    error?.bodyResponse?.toString?.() ||
    error?.toString?.() ||
    fallback ||
    "No details available for the error"
  );
}

export function onEnter(
  handler: (e: KeyboardEvent) => void
): KeyboardEventHandler {
  // @ts-ignore
  return (e: KeyboardEvent) => {
    if (e.key === "Enter") handler(e);
  };
}

export function resolveServerPath(plugin) {
  const { pathPrefix } = getFetchParameters();
  return pathPrefix + plugin.serverPath;
}

function formatValidationErrors(errors: ValidationErrorsType) {
  if (!Array.isArray(errors) || errors.length === 0) return "";
  return errors
    .map(({ path, reason }) => `params.${path}: ${reason}`)
    .join("\n");
}

export function getOperatorPromptConfigs(operatorPrompt: OperatorPromptType) {
  const showResultOrError =
    operatorPrompt.hasResultOrError ||
    operatorPrompt.executorError ||
    operatorPrompt.resolveError;
  const showPrompt = operatorPrompt.showPrompt;
  const isExecuting = operatorPrompt.isExecuting;
  const show = showResultOrError || showPrompt || isExecuting;
  const customPrompt = operatorPrompt?.promptView;
  const customPromptName = customPrompt?.name;

  let submitButtonText = "Execute";
  const submitButtonOptions = operatorPrompt.submitOptions.options;
  const submitButtonLoading = operatorPrompt.submitOptions.isLoading;
  const hasSubmitButtonOptions = operatorPrompt.submitOptions.hasOptions;
  const showWarning = operatorPrompt.submitOptions.showWarning;
  const warningMessage = operatorPrompt.submitOptions.warningMessage;
  let cancelButtonText = "Cancel";
  let onSubmit, onCancel;

  if (customPromptName == "PromptView") {
    const prompt = types.PromptView.fromJSON(customPrompt);
    if (prompt.submitButtonLabel) {
      submitButtonText = prompt.submitButtonLabel;
    }
  }

  if (operatorPrompt.showPrompt) {
    onSubmit = operatorPrompt.onSubmit;
    onCancel = operatorPrompt.cancel;
  } else if (showResultOrError) {
    onCancel = operatorPrompt.close;
    cancelButtonText = "Close";
  }

  const title = getPromptTitle(operatorPrompt);
  const hasValidationErrors = operatorPrompt.validationErrors?.length > 0;
  const { resolving, pendingResolve } = operatorPrompt;
  const validationErrorsStr = formatValidationErrors(
    operatorPrompt.validationErrors
  );

  return {
    title,
    hasValidationErrors,
    resolving,
    pendingResolve,
    validationErrorsStr,
    showResultOrError,
    showPrompt,
    isExecuting,
    customPrompt,
    customPromptName,
    show,
    submitButtonText,
    submitButtonOptions,
    submitButtonLoading,
    hasSubmitButtonOptions,
    showWarning,
    warningMessage,
    cancelButtonText,
    onSubmit,
    onCancel,
  };
}

function getPromptTitle(operatorPrompt) {
  const definition = operatorPrompt.showPrompt
    ? operatorPrompt?.inputFields
    : operatorPrompt?.outputFields;
  return definition?.view?.label;
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
