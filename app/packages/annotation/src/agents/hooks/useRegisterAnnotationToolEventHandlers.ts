import {
  ToolsContext,
  useToolsContext,
  useToolsState,
} from "./useToolsContext";
import { useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAnnotationAgent } from "./useAnnotationAgent";
import { useAgentSelector } from "./useAgentSelector";
import { useApplyInferenceResult } from "./useApplyInferenceResult";
import { useAnnotationContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext";
import { useRegisterPointSelectionEventHandlers } from "./useRegisterPointSelectionEventHandlers";
import { useRegisterAgentLifecycleEvents } from "./useRegisterAgentLifecycleEvents";

const isToolsContextValid = (context: ToolsContext): boolean => {
  return (
    !!context.taskType &&
    ((context.positivePoints?.length ?? 0) > 0 ||
      (context.negativePoints?.length ?? 0) > 0 ||
      (context.regionsOfInterest?.length ?? 0) > 0 ||
      !!context.textPrompt)
  );
};

/**
 * Hook which registers event handlers related to AI-assisted annotation tools,
 * e.g. point selection.
 *
 * **Note: this hook must only be invoked in a single top-level component;
 * reuse will cause duplicate event handler registration.**
 */
export const useRegisterAnnotationToolEventHandlers = () => {
  const toolsContext = useToolsContext();
  const { reset: resetToolsState } = useToolsState();
  const { selected, createNew } = useAnnotationContext();

  const agent = useAnnotationAgent(useAgentSelector().activeAgent?.agent);
  const createDetection = useCallback(
    () => createNew("Detection"),
    [createNew]
  );
  const applyInferenceResult = useApplyInferenceResult(createDetection);

  // register handlers for specific tools
  useRegisterPointSelectionEventHandlers();

  // bridge agent lifecycle → annotation event bus + inference status atoms
  useRegisterAgentLifecycleEvents();

  // inference trigger
  useEffect(
    () => {
      let cancelled = false;

      if (isToolsContextValid(toolsContext) && agent) {
        const labelId = selected.label?.overlay?.id ?? uuidv4();

        agent
          .infer(labelId)
          .then((res) => {
            if (cancelled) return;
            if (res) applyInferenceResult(res);
          })
          .catch(() => {
            // Status transitions are driven by the agent's lifecycle events;
            // nothing to do here on rejection.
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
