import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import {
  ToolsContext,
  useToolsContext,
  useToolsState,
} from "./useToolsContext";
import { useAnnotationAgent } from "./useAnnotationAgent";
import { useAgentSelector } from "./useAgentSelector";
import { useApplyInferenceResult } from "./useApplyInferenceResult";
import { useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAnnotationContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import useCreate from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useCreate";

const isToolsContextValid = (context: ToolsContext): boolean => {
  return (
    !!context.taskType &&
    ((context.positivePoints?.length ?? 0) > 0 ||
      (context.negativePoints?.length ?? 0) > 0 ||
      (context.regionsOfInterest?.length ?? 0) > 0 ||
      !!context.textPrompt)
  );
};

export const useRegisterAISegmentationEventHandlers = () => {
  const { scene } = useLighter();
  const {
    addPositivePoint,
    removePositivePoint,
    reset: resetToolsState,
  } = useToolsState();
  const toolsContext = useToolsContext();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const { selectedLabel } = useAnnotationContext();
  const agent = useAnnotationAgent(useAgentSelector().activeAgent?.agent);

  const applyInferenceResult = useApplyInferenceResult(useCreate("Detection"));

  useEventHandler(
    "lighter:keypoint-point-added",
    useCallback(
      (payload) => {
        addPositivePoint([payload.point.x, payload.point.y]);
      },
      [addPositivePoint]
    )
  );

  useEventHandler(
    "lighter:keypoint-point-deleted",
    useCallback(
      (payload) => {
        removePositivePoint(payload.pointIndex);
      },
      [removePositivePoint]
    )
  );

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
