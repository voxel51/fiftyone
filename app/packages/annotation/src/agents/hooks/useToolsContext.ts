import { AgentTaskType, ROI, Vec2 } from "../types";
import { atom, useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { useActiveTask } from "./useActiveTask";

/** Read-only snapshot of annotation tool state. */
export type ToolsContext = {
  /** The active task type, or `null` if no task is selected. */
  taskType: AgentTaskType | null;
  /** The current selection of positive point prompts. */
  positivePoints?: Vec2[];
  /** The current selection of negative point prompts. */
  negativePoints?: Vec2[];
  /** The current selection of region-of-interest prompts. */
  regionsOfInterest?: ROI[];
  /** The current text prompt. */
  textPrompt?: string;
};

/**
 * Mutable interface for annotation tool state.
 *
 * Read-only fields mirror {@link ToolsContext} and reflect the current tool
 * state.  Mutation methods are the integration surface for canvas tools — call
 * them as the user interacts with annotation tools (point placement, ROI
 * drawing, text entry) so that the next `infer()` call receives up-to-date
 * inputs.
 *
 * Call {@link reset} after inference completes (or on task/agent change) to
 * clear all accumulated inputs.
 */
export interface ToolsState extends ToolsContext {
  /** Adds a positive point prompt to the current set. */
  addPositivePoint(point: Vec2): void;
  /** Removes a positive point prompt by index. */
  removePositivePoint(index: number): void;
  /** Adds a negative point prompt to the current set. */
  addNegativePoint(point: Vec2): void;
  /** Removes a negative point prompt by index. */
  removeNegativePoint(index: number): void;
  /** Replaces the full set of ROI prompts. */
  setRegionsOfInterest(rois: ROI[]): void;
  /** Sets the free-text prompt. */
  setTextPrompt(prompt: string): void;
  /** Clears all tool inputs back to their initial state. */
  reset(): void;
}

const positivePointsAtom = atom<Vec2[]>([]);
const negativePointsAtom = atom<Vec2[]>([]);
const regionsOfInterestAtom = atom<ROI[]>([]);
const textPromptAtom = atom<string | null>(null);

/**
 * Hook which returns the current {@link ToolsContext} (read-only).
 *
 * To *write* tool state, see {@link useToolsState} instead.
 */
export const useToolsContext = (): ToolsContext => {
  const { activeTask } = useActiveTask();
  const positivePoints = useAtomValue(positivePointsAtom);
  const negativePoints = useAtomValue(negativePointsAtom);
  const regionsOfInterest = useAtomValue(regionsOfInterestAtom);
  const textPrompt = useAtomValue(textPromptAtom);

  return useMemo(
    () => ({
      taskType: activeTask,
      positivePoints,
      negativePoints,
      regionsOfInterest,
      textPrompt,
    }),
    [activeTask, positivePoints, negativePoints, regionsOfInterest, textPrompt]
  );
};

/**
 * Hook which exposes the full mutable {@link ToolsState}.
 *
 * To *read* current state, see {@link useToolsContext}.
 */
export const useToolsState = (): ToolsState => {
  const { activeTask } = useActiveTask();
  const [positivePoints, setPositivePoints] = useAtom(positivePointsAtom);
  const [negativePoints, setNegativePoints] = useAtom(negativePointsAtom);
  const [regionsOfInterest, setRegionsOfInterest] = useAtom(
    regionsOfInterestAtom
  );
  const [textPrompt, setTextPrompt] = useAtom(textPromptAtom);

  const addPositivePoint = useCallback(
    (point: Vec2) => setPositivePoints((prev) => [...prev, point]),
    [setPositivePoints]
  );

  const removePositivePoint = useCallback(
    (index: number) =>
      setPositivePoints((prev) => prev.filter((_, i) => i !== index)),
    [setPositivePoints]
  );

  const addNegativePoint = useCallback(
    (point: Vec2) => setNegativePoints((prev) => [...prev, point]),
    [setNegativePoints]
  );

  const removeNegativePoint = useCallback(
    (index: number) =>
      setNegativePoints((prev) => prev.filter((_, i) => i !== index)),
    [setNegativePoints]
  );

  const reset = useCallback(() => {
    setPositivePoints([]);
    setNegativePoints([]);
    setRegionsOfInterest([]);
    setTextPrompt(null);
  }, [
    setPositivePoints,
    setNegativePoints,
    setRegionsOfInterest,
    setTextPrompt,
  ]);

  return useMemo(
    () => ({
      taskType: activeTask,
      positivePoints,
      negativePoints,
      regionsOfInterest,
      textPrompt,
      addPositivePoint,
      removePositivePoint,
      addNegativePoint,
      removeNegativePoint,
      setRegionsOfInterest,
      setTextPrompt,
      reset,
    }),
    [
      activeTask,
      positivePoints,
      negativePoints,
      regionsOfInterest,
      textPrompt,
      addPositivePoint,
      removePositivePoint,
      addNegativePoint,
      removeNegativePoint,
      setRegionsOfInterest,
      setTextPrompt,
      reset,
    ]
  );
};
