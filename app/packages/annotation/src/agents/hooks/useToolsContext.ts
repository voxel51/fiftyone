import { AgentTaskType, PointDescriptor, ROI, Vec2 } from "../types";
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
  addPositivePoint(descriptor: PointDescriptor): void;
  /** Removes a positive point prompt by its ID. */
  removePositivePoint(id: string): void;
  /** Adds a negative point prompt to the current set. */
  addNegativePoint(descriptor: PointDescriptor): void;
  /** Removes a negative point prompt by its ID. */
  removeNegativePoint(id: string): void;
  /** Replaces the full set of ROI prompts. */
  setRegionsOfInterest(rois: ROI[]): void;
  /** Sets the free-text prompt. */
  setTextPrompt(prompt: string): void;
  /** Clears all tool inputs back to their initial state. */
  reset(): void;
}

const positivePointsAtom = atom<PointDescriptor[]>([]);
const negativePointsAtom = atom<PointDescriptor[]>([]);
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
      positivePoints: positivePoints.map((d) => d.point),
      negativePoints: negativePoints.map((d) => d.point),
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
    (descriptor: PointDescriptor) =>
      setPositivePoints((prev) => [...prev, descriptor]),
    [setPositivePoints]
  );

  const removePositivePoint = useCallback(
    (id: string) =>
      setPositivePoints((prev) => prev.filter((d) => d.id !== id)),
    [setPositivePoints]
  );

  const addNegativePoint = useCallback(
    (descriptor: PointDescriptor) =>
      setNegativePoints((prev) => [...prev, descriptor]),
    [setNegativePoints]
  );

  const removeNegativePoint = useCallback(
    (id: string) =>
      setNegativePoints((prev) => prev.filter((d) => d.id !== id)),
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
      positivePoints: positivePoints.map((d) => d.point),
      negativePoints: negativePoints.map((d) => d.point),
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
