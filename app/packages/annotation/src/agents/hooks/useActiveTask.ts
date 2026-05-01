import { atom, useAtom } from "jotai";
import { useMemo } from "react";
import { AgentTaskType } from "../types";

const activeTaskAtom = atom<AgentTaskType | null>(null);

/**
 * Read/write access to the active annotation task type.
 */
export interface ActiveTask {
  /** The currently selected task, or `null` if none are selected. */
  activeTask: AgentTaskType | null;
  /** Set the active task type. */
  setActiveTask(task: AgentTaskType | null): void;
}

/**
 * Hook providing the active annotation task state.
 */
export const useActiveTask = (): ActiveTask => {
  const [activeTask, setActiveTask] = useAtom(activeTaskAtom);

  return useMemo(
    () => ({ activeTask, setActiveTask }),
    [activeTask, setActiveTask]
  );
};
