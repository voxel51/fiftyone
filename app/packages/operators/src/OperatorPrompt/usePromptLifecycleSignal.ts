import { getEventBus } from "@fiftyone/events";
import { useEffect } from "react";
import type { OperatorPromptType } from "../types";
import { getOperatorPromptConfigs } from "../utils";

type PromptPhase = "input" | "executing" | "output" | "closed";

/** e2e specs wait on the prompt phase an open, edit, execute or close commits */
type OperatorPromptE2EEvents = {
  "e2e:operators:prompt": {
    operator: string;
    phase: PromptPhase;
    /** the form's params, as JSON */
    params: string;
    /** the form is resolved and valid, so Execute is enabled */
    ready: boolean;
  };
};

const dispatch = (payload: OperatorPromptE2EEvents["e2e:operators:prompt"]) =>
  getEventBus<OperatorPromptE2EEvents>().dispatch(
    "e2e:operators:prompt",
    payload,
  );

export const usePromptLifecycleSignal = (prompt: OperatorPromptType) => {
  const operator = prompt.operator.uri;
  const {
    disableSubmit,
    isExecuting,
    showPrompt,
    showResultOrError,
    submitButtonLoading,
  } = getOperatorPromptConfigs(prompt);
  // outputs resolve after the result lands; an error has none to wait for
  const outputShown =
    showResultOrError &&
    (prompt.outputFields !== undefined || Boolean(prompt.executorError));
  const phase: PromptPhase | null = isExecuting
    ? "executing"
    : outputShown
      ? "output"
      : showPrompt
        ? "input"
        : null;
  const params = JSON.stringify(prompt.promptingOperator.params ?? {});
  const ready = !disableSubmit && !submitButtonLoading;

  useEffect(() => {
    if (phase) dispatch({ operator, phase, params, ready });
  }, [operator, phase, params, ready]);

  useEffect(
    () => () =>
      dispatch({ operator, phase: "closed", params: "{}", ready: false }),
    [operator],
  );
};
