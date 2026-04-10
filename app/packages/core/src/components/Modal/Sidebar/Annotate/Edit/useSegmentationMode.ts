import {
  AgentTaskType,
  useActiveTask,
  useAgentSelector,
  usePointSelection,
  useToolsState,
} from "@fiftyone/annotation/src/agents";
import { useCallback, useEffect, useMemo } from "react";
import { atom, useAtom } from "jotai";

export interface SegmentationMode {
  activate(): void;
  deactivate(): void;
  isActive: boolean;
}

/**
 * Maintains the activation status of segmentation mode.
 */
const segmentationModeActiveAtom = atom(false);

/**
 * Hook which provides control over activation/deactivation of segmentation mode.
 */
export const useSegmentationMode = (): SegmentationMode => {
  const [segmentationModeActive, setSegmentationModeActive] = useAtom(
    segmentationModeActiveAtom
  );
  const agentSelector = useAgentSelector();
  const { setActiveTask } = useActiveTask();
  const { reset: resetToolsState } = useToolsState();
  const pointSelection = usePointSelection();

  // We don't currently expose agent selection capabilities in the UX.
  // Select the first available agent once the agents have resolved.
  useEffect(() => {
    if (agentSelector.isResolved && !agentSelector.activeAgent) {
      agentSelector.setActiveAgent(agentSelector.agents[0]);
    }
  }, [agentSelector]);

  const activate = useCallback(() => {
    setSegmentationModeActive(true);
    setActiveTask(AgentTaskType.SEGMENT);
    pointSelection.activate();
  }, [pointSelection, setActiveTask, setSegmentationModeActive]);

  const deactivate = useCallback(() => {
    pointSelection.deactivate();
    resetToolsState();
    setActiveTask(null);
    setSegmentationModeActive(false);
  }, [
    pointSelection,
    resetToolsState,
    setActiveTask,
    setSegmentationModeActive,
  ]);

  return useMemo(
    () => ({
      activate,
      deactivate,
      isActive: segmentationModeActive,
    }),
    [activate, deactivate, segmentationModeActive]
  );
};
