import {
  AgentTaskType,
  isAgentSelectable,
  useActiveTask,
  useAgentSelector,
  useClearPointPrompts,
  usePointSelection,
  usePointSelectionSeed,
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

  // Restore the remembered agent once it's selectable, else fall back to the
  // first selectable one. Bootstrap from the same filter the selector uses —
  // picking a hidden/unavailable entry here would just be cleared by the
  // dropdown and reselected in a loop.
  //
  // Keeps re-evaluating rather than firing once: service-backed agents register
  // a beat after the static ones (their binding resolves async), so the
  // remembered pick often isn't selectable yet on the first resolve. Adopting
  // it whenever it shows up is safe because a user pick writes `lastAgentId`
  // too — once the two agree, this can't fight the dropdown.
  useEffect(() => {
    if (!agentSelector.isResolved) return;

    const selectable = agentSelector.agents.filter(isAgentSelectable);
    const remembered = selectable.find(
      (d) => d.id === agentSelector.lastAgentId,
    );

    if (remembered) {
      if (remembered.id !== agentSelector.activeAgent?.id) {
        agentSelector.setDefaultAgent(remembered);
      }

      return;
    }

    if (!agentSelector.activeAgent && selectable[0]) {
      agentSelector.setDefaultAgent(selectable[0]);
    }
  }, [agentSelector]);
};

/**
 * Hook which provides control over activation/deactivation of AI annotation mode.
 */
export const useAIAnnotationMode = (): AIAnnotationMode => {
  const [isActive, setIsActive] = useAtom(isActiveAtom);

  const { setActiveTask } = useActiveTask();
  const pointSelection = usePointSelection();
  const { clearSeedNew } = usePointSelectionSeed();

  // bootstrap AI annotation capabilities
  useDefaultAgent();

  // Clears prompt state without tearing down point selection. The SAM2 point
  // context is reset at real session boundaries — here on deactivate, and
  // implicitly on the deactivate→activate cycle a right-click finalize runs —
  // plus wherever the prompted frame stops being the frame on screen (see
  // `useEndPointSessionOnFrameChange`). It is deliberately NOT cleared on
  // selection changes: an inference creating and selecting a fresh mask IS a
  // selection change, so clearing there wiped the seed point of every mask
  // after the first.
  const clearPointPrompts = useClearPointPrompts();

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
    clearPointPrompts();

    setActiveTask(null);
    setIsActive(false);
  }, [clearPointPrompts, pointSelection, setActiveTask, setIsActive]);

  return useMemo(
    () => ({
      activate,
      deactivate,
      isActive,
    }),
    [activate, deactivate, isActive],
  );
};
