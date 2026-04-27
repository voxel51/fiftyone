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
import { useActivePointSelectionOverlay } from "./usePointSelection";

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
  const { selectedLabel } = useAnnotationContext();

  const agent = useAnnotationAgent(useAgentSelector().activeAgent?.agent);
  const applyInferenceResult = useApplyInferenceResult(useCreate("Detection"));

  const pointOverlay = useActivePointSelectionOverlay();

  // register handlers for specific tools
  useRegisterPointSelectionEventHandlers();

  // inference trigger
  useEffect(
    () => {
      let cancelled = false;

      if (isToolsContextValid(toolsContext)) {
        const labelId = selectedLabel?.overlay?.id ?? uuidv4();

        // Pulse all current prompt points while inference is in flight so the
        // user sees that their click triggered work.
        const ids = pointOverlay?.getPointIds() ?? [];
        if (ids.length > 0) {
          pointOverlay?.setRipplePointIds(ids);
        }

        agent
          ?.infer(labelId)
          .then((res) => {
            if (res && !cancelled) {
              applyInferenceResult(res);
            }
          })
          .finally(() => {
            if (!cancelled) {
              pointOverlay?.clearRipple();
            }
          });
      }

      return () => {
        cancelled = true;
        pointOverlay?.clearRipple();
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
