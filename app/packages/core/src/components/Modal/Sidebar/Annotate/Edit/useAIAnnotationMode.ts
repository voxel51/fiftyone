import {
  AgentTaskType,
  useActiveTask,
  useAgentSelector,
  usePointSelection,
  useToolsState,
} from "@fiftyone/annotation/src/agents";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, useAtom } from "jotai";
import { useAnnotationContext } from "./state";

export interface AIAnnotationMode {
  activate(): void;
  deactivate(): void;
  isActive: boolean;
}

/**
 * Maintains the activation status of AI annotation mode.
 */
const isActiveAtom = atom(false);

/**
 * Helper hook which configures a default {@link AnnotationAgent}.
 */
const useDefaultAgent = () => {
  const agentSelector = useAgentSelector();

  // We don't currently expose agent selection capabilities in the UX.
  // Select the first available agent once the agents have resolved.
  useEffect(() => {
    if (agentSelector.isResolved && !agentSelector.activeAgent) {
      agentSelector.setActiveAgent(agentSelector.agents[0]);
    }
  }, [agentSelector]);
};

/**
 * Helper hook which resets state when the label selection changes.
 *
 * @param isActive Flag indicating whether AI annotation mode is active
 * @param reset Callback invoked when label selection state changes
 */
const useLabelReset = (isActive: boolean, reset: () => void) => {
  const { selectedLabel } = useAnnotationContext();
  const selectedLabelRef = useRef(selectedLabel);
  const previousSelectedLabelIdRef = useRef<string | null>(
    selectedLabel?.overlay?.id ?? null
  );

  selectedLabelRef.current = selectedLabel;

  // When the selected label changes,
  // reset state to ensure a clean starting point for the next label
  useEffect(() => {
    if (!isActive) {
      previousSelectedLabelIdRef.current = selectedLabel?.overlay?.id ?? null;
      return;
    }

    const previousId = previousSelectedLabelIdRef.current;
    const currentId = selectedLabel?.overlay?.id ?? null;

    if (previousId && previousId !== currentId) {
      reset();
    }

    previousSelectedLabelIdRef.current = currentId;
  }, [selectedLabel]);
};

/**
 * Hook which provides control over activation/deactivation of AI annotation mode.
 */
export const useAIAnnotationMode = (): AIAnnotationMode => {
  const [isActive, setIsActive] = useAtom(isActiveAtom);

  const { setActiveTask } = useActiveTask();
  const { reset: resetToolsState } = useToolsState();
  const pointSelection = usePointSelection();

  // bootstrap AI annotation capabilities
  useDefaultAgent();

  const resetTools = useCallback(() => {
    pointSelection.deactivate();
    pointSelection.clearPoints();
    resetToolsState();
  }, [pointSelection, resetToolsState]);

  useLabelReset(isActive, resetTools);

  const activate = useCallback(() => {
    if (isActive) {
      return;
    }

    pointSelection.activate();
    setIsActive(true);
    setActiveTask(AgentTaskType.SEGMENT);
  }, [isActive, pointSelection, setActiveTask, setIsActive]);

  const deactivate = useCallback(() => {
    if (!isActive) {
      return;
    }

    resetTools();

    setActiveTask(null);
    setIsActive(false);
  }, [isActive, resetTools, setActiveTask, setIsActive]);

  return useMemo(
    () => ({
      activate,
      deactivate,
      isActive,
    }),
    [activate, deactivate, isActive]
  );
};
