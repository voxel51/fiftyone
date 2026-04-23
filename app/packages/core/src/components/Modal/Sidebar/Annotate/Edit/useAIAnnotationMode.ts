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
import {
  BoundingBoxOverlay,
  KeypointPointHitAction,
  Point,
} from "@fiftyone/lighter";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, useAtom } from "jotai";
import { useAnnotationContext } from "./state";
import { ClickEventModifiers } from "@fiftyone/utilities";

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
 * Hook which provides control over activation/deactivation of AI annotation mode.
 */
export const useAIAnnotationMode = (): AIAnnotationMode => {
  const [isActive, setIsActive] = useAtom(isActiveAtom);
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
  const previousSelectedLabelIdRef = useRef<string | null>(
    selectedLabel?.overlay?.id ?? null
  );
  selectedLabelRef.current = selectedLabel;

  // When the user commits/exits a label (selected label transitions away
  // from a populated overlay), wipe the inference prompt points so the next
  // label starts from a clean slate. We stay in segmentation mode.
  useEffect(() => {
    if (!isActive) {
      previousSelectedLabelIdRef.current = selectedLabel?.overlay?.id ?? null;
      return;
    }

    const previousId = previousSelectedLabelIdRef.current;
    const currentId = selectedLabel?.overlay?.id ?? null;

    if (previousId && previousId !== currentId) {
      pointSelection.clearPoints();
      resetToolsState();
    }

    previousSelectedLabelIdRef.current = currentId;
  }, [selectedLabel]);

  // Points placed on the current label's mask are interpreted as negative;
  // points placed off-mask are positive.
  // Holding shift inverts the result.
  const resolvePointVariant = useCallback(
    (
      relativePoint: Point,
      { shiftKey }: ClickEventModifiers
    ): PointSelectionVariant => {
      const label = selectedLabelRef.current;
      const onMask =
        label && label.overlay instanceof BoundingBoxOverlay
          ? label.overlay.containsMaskPixel(relativePoint)
          : false;

      const variant = onMask ? NEGATIVE_POINT_VARIANT : POSITIVE_POINT_VARIANT;

      return !shiftKey
        ? // normal variant if shift key is not pressed
          variant
        : // otherwise invert the variant
        variant === POSITIVE_POINT_VARIANT
        ? NEGATIVE_POINT_VARIANT
        : POSITIVE_POINT_VARIANT;
    },
    []
  );

  // Clicking an existing point deletes it
  const resolvePointHit = useCallback(() => KeypointPointHitAction.DELETE, []);

  const activate = useCallback(() => {
    setIsActive(true);
    setActiveTask(AgentTaskType.SEGMENT);
    pointSelection.activate(resolvePointVariant, resolvePointHit);
  }, [
    pointSelection,
    resolvePointHit,
    resolvePointVariant,
    setActiveTask,
    setIsActive,
  ]);

  const deactivate = useCallback(() => {
    pointSelection.deactivate();
    resetToolsState();
    setActiveTask(null);
    setIsActive(false);
  }, [pointSelection, resetToolsState, setActiveTask, setIsActive]);

  return useMemo(
    () => ({
      activate,
      deactivate,
      isActive: isActive,
    }),
    [activate, deactivate, isActive]
  );
};
