import {
  ToolsContext,
  useToolsContext,
  useToolsState,
} from "./useToolsContext";
import { useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAnnotationAgent } from "./useAnnotationAgent";
import { useAgentSelector } from "./useAgentSelector";
import { useApplyInferenceResult } from "./useApplyInferenceResult";
import { useAnnotationContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import useCreate from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useCreate";
import { useRegisterPointSelectionEventHandlers } from "./useRegisterPointSelectionEventHandlers";

const isToolsContextValid = (context: ToolsContext): boolean => {
  return (
    !!context.taskType &&
    ((context.positivePoints?.length ?? 0) > 0 ||
      (context.negativePoints?.length ?? 0) > 0 ||
      (context.regionsOfInterest?.length ?? 0) > 0 ||
      !!context.textPrompt)
  );
};

export const useRegisterAnnotationToolEventHandlers = () => {
  const toolsContext = useToolsContext();
  const { reset: resetToolsState } = useToolsState();
  const { selectedLabel } = useAnnotationContext();

  const agent = useAnnotationAgent(useAgentSelector().activeAgent?.agent);
  const applyInferenceResult = useApplyInferenceResult(useCreate("Detection"));

  // register handlers for specific tools
  useRegisterPointSelectionEventHandlers();

  // inference trigger
  useEffect(
    () => {
      let cancelled = false;

      if (isToolsContextValid(toolsContext)) {
        const labelId = selectedLabel?.overlay?.id ?? uuidv4();

        agent?.infer(labelId).then((res) => {
          if (res && !cancelled) {
            applyInferenceResult(res);
          }
        });
      }

      return () => {
        cancelled = true;
      };
    },
    // trigger inference every time the input context changes
    [toolsContext]
  );

  // reset tools state on mount and unmount
  useEffect(() => {
    resetToolsState();

    return resetToolsState;
  }, []);
};
