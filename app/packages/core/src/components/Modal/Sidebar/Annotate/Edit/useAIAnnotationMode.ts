import {
  AgentTaskType,
  useActiveTask,
  useAgentSelector,
  usePointSelection,
  useToolsState,
} from "@fiftyone/annotation/src/agents";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, useAtom, useAtomValue } from "jotai";
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
 * Read-only hook for AI annotation mode activation. Safe to call from
 * components that should not trigger the side effects of
 * {@link useAIAnnotationMode} (e.g. default agent bootstrap, label reset).
 */
export const useIsAIAnnotationModeActive = (): boolean =>
  useAtomValue(isActiveAtom);

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
  const previousSelectedLabelIdRef = useRef<string | null>(
    selectedLabel?.overlay?.id ?? null
  );

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

  // Clears prompt state without tearing down point selection. Used on
  // label change — we stay in AI mode for the next label.
  const resetTools = useCallback(() => {
    pointSelection.clearPoints();
    resetToolsState();
  }, [pointSelection, resetToolsState]);

  useLabelReset(isActive, resetTools);

  const activate = useCallback(() => {
    if (isActive) {
      return;
    }

    setActiveTask(AgentTaskType.SEGMENT);
    setIsActive(true);
    pointSelection.activate();
  }, [isActive, pointSelection, setActiveTask, setIsActive]);

  const deactivate = useCallback(() => {
    if (!isActive) {
      return;
    }

    pointSelection.deactivate();
    resetTools();

    setActiveTask(null);
    setIsActive(false);
  }, [resetTools, isActive, pointSelection, setActiveTask, setIsActive]);

  return useMemo(
    () => ({
      activate,
      deactivate,
      isActive,
    }),
    [activate, deactivate, isActive]
  );
};
