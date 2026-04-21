import {
  AgentTaskType,
  NEGATIVE_POINT_VARIANT,
  PointSelectionVariant,
  POSITIVE_POINT_VARIANT,
  useActiveTask,
  useAgentSelector,
  usePointSelection,
  useToolsState,
} from "@fiftyone/annotation/src/agents";
import { BoundingBoxOverlay } from "@fiftyone/lighter";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, useAtom } from "jotai";
import { useAnnotationContext } from "./state";

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
  const { selectedLabel } = useAnnotationContext();
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

  const selectedLabelRef = useRef(selectedLabel);
  selectedLabelRef.current = selectedLabel;

  // Points placed on the current label's mask are interpreted as negative;
  // points placed off-mask are positive
  const resolvePointVariant = useCallback(
    (relativePoint: { x: number; y: number }): PointSelectionVariant => {
      const label = selectedLabelRef.current;
      if (!label || !(label.overlay instanceof BoundingBoxOverlay)) {
        return POSITIVE_POINT_VARIANT;
      }

      return label.overlay.containsMaskPixel(relativePoint)
        ? NEGATIVE_POINT_VARIANT
        : POSITIVE_POINT_VARIANT;
    },
    []
  );

  const activate = useCallback(() => {
    setSegmentationModeActive(true);
    setActiveTask(AgentTaskType.SEGMENT);
    pointSelection.activate(resolvePointVariant);
  }, [
    pointSelection,
    resolvePointVariant,
    setActiveTask,
    setSegmentationModeActive,
  ]);

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
