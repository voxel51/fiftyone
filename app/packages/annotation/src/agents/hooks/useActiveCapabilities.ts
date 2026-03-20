import { atom, useAtom } from "jotai";
import { useEffect, useMemo } from "react";
import {
  AgentTaskType,
  AnnotationAgent,
  InferenceCapability,
  InferenceResultProxy,
} from "../types";

const capabilitiesAtom = atom<InferenceCapability[]>([]);
const isResolvedAtom = atom<boolean>(false);

/**
 * The inference capabilities the active agent supports for the current task.
 */
export interface ActiveCapabilities {
  /** Capabilities the active agent advertises for the current task. */
  capabilities: InferenceCapability[];

  /** `true` once the capability query has completed. */
  isResolved: boolean;
}

/**
 * Hook which provides the {@link ActiveCapabilities} for the provided agent
 * and task.
 *
 * Returns an empty, unresolved state when `agent` or `task` is nullish.
 *
 * @param agent The active annotation agent
 * @param task The active task type
 */
export const useActiveCapabilities = <T extends InferenceResultProxy>(
  agent?: AnnotationAgent<T> | null,
  task?: AgentTaskType | null
): ActiveCapabilities => {
  const [capabilities, setCapabilities] = useAtom(capabilitiesAtom);
  const [isResolved, setIsResolved] = useAtom(isResolvedAtom);

  useEffect(() => {
    // eagerly clear to ensure consistent UX
    setCapabilities([]);
    setIsResolved(false);

    if (!agent || !task) return;

    let cancelled = false;

    agent.listInferenceCapabilities(task).then((result) => {
      if (!cancelled) {
        setCapabilities(result);
        setIsResolved(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [agent, task]);

  return useMemo(
    () => ({ capabilities, isResolved }),
    [capabilities, isResolved]
  );
};
