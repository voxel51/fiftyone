import {
  AgentTaskType,
  useActiveTask,
  useAgentSelector,
  usePointSelection,
  usePointSelectionSeed,
  useToolsState,
} from "@fiftyone/annotation/src/agents";
import { useCallback, useEffect, useMemo } from "react";
import { atom, getDefaultStore, useAtom, useAtomValue } from "jotai";

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
<<<<<<< HEAD
 * Helper hook which resets state when the label selection changes.
 *
 * @param isActive Flag indicating whether AI annotation mode is active
 * @param reset Callback invoked when label selection state changes
 */
const useLabelReset = (isActive: boolean, reset: () => void) => {
  const { selected } = useAnnotationContext();
  const previousSelectedLabelIdRef = useRef<string | null>(
    selected?.label?.overlay?.id ?? null,
  );

  // When the selected label changes,
  // reset state to ensure a clean starting point for the next label
  useEffect(() => {
    if (!isActive) {
      previousSelectedLabelIdRef.current = selected?.label?.overlay?.id ?? null;
      return;
    }

    const previousId = previousSelectedLabelIdRef.current;
    const currentId = selected?.label?.overlay?.id ?? null;

    if (previousId && previousId !== currentId) {
      reset();
    }

    previousSelectedLabelIdRef.current = currentId;
  }, [selected?.label]);
};

/**
=======
>>>>>>> main
 * Hook which provides control over activation/deactivation of AI annotation mode.
 */
export const useAIAnnotationMode = (): AIAnnotationMode => {
  const [isActive, setIsActive] = useAtom(isActiveAtom);

  const { setActiveTask } = useActiveTask();
  const { reset: resetToolsState } = useToolsState();
  const pointSelection = usePointSelection();
  const { clearSeedNew } = usePointSelectionSeed();

  // bootstrap AI annotation capabilities
  useDefaultAgent();

  // Clears prompt state without tearing down point selection. The SAM2 point
  // context is reset only at real session boundaries — here on deactivate, and
  // implicitly on the deactivate→activate cycle a right-click finalize runs.
  // It is deliberately NOT cleared on selection changes: an inference creating
  // and selecting a fresh mask IS a selection change, so clearing there wiped
  // the seed point of every mask after the first.
  const resetTools = useCallback(() => {
    pointSelection.clearPoints();
    resetToolsState();
  }, [pointSelection, resetToolsState]);

  // Guards read fresh from the jotai store so back-to-back deactivate /
  // activate calls (e.g. AI right-click finalize) don't no-op on a stale
  // closure value of `isActive`.
  const activate = useCallback(() => {
    if (getDefaultStore().get(isActiveAtom)) return;

    // A fresh session refines whatever's selected by default; only a finalize
    // (which re-activates, then re-marks the flag) seeds a new label. Clearing
    // here keeps the "select an existing mask, then refine it with points"
    // entry working after a prior session committed.
    clearSeedNew();

    setActiveTask(AgentTaskType.SEGMENT);
    setIsActive(true);
    pointSelection.activate();
  }, [clearSeedNew, pointSelection, setActiveTask, setIsActive]);

  const deactivate = useCallback(() => {
    if (!getDefaultStore().get(isActiveAtom)) return;

    pointSelection.deactivate();
    resetTools();

    setActiveTask(null);
    setIsActive(false);
  }, [resetTools, pointSelection, setActiveTask, setIsActive]);

  return useMemo(
    () => ({
      activate,
      deactivate,
      isActive,
    }),
    [activate, deactivate, isActive],
  );
};
