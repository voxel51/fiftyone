import { atom, useAtom } from "jotai";
import { AgentDescriptor } from "../registry";
import { useAgentRegistry } from "./useAgentRegistry";
import { useEffect, useMemo, useState } from "react";
import { InferenceResultProxy } from "../types";

/**
 * State and actions for choosing the active annotation agent.
 */
export interface AgentSelector {
  /** The active agent, or `null` if none are selected. */
  activeAgent: AgentDescriptor<InferenceResultProxy> | null;

  /** The list of available agents. */
  agents: AgentDescriptor<InferenceResultProxy>[];

  /** `true` once the `agents` query has completed */
  isResolved: boolean;

  /** Set the active agent. */
  setActiveAgent: (descriptor: AgentDescriptor<InferenceResultProxy>) => void;
}

const activeAgentAtom = atom<AgentDescriptor<InferenceResultProxy> | null>(
  null
);
const isResolvedAtom = atom<boolean>(false);

/**
 * Hook providing the current {@link AgentSelector} state.
 */
export const useAgentSelector = (): AgentSelector => {
  const [activeAgent, setActiveAgent] = useAtom(activeAgentAtom);
  const [isResolved, setIsResolved] = useAtom(isResolvedAtom);

  const [agents, setAgents] = useState<AgentDescriptor<InferenceResultProxy>[]>(
    () => []
  );

  const registry = useAgentRegistry();

  // load agents on registry change
  useEffect(() => {
    // eagerly clear to ensure consistent UX
    setAgents([]);
    setIsResolved(false);

    let cancelled = false;

    registry.listAgents().then((res) => {
      if (!cancelled) {
        setAgents(res);
        setIsResolved(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [registry]);

  return useMemo(
    () => ({
      activeAgent,
      agents,
      isResolved,
      setActiveAgent,
    }),
    [activeAgent, agents, isResolved, setActiveAgent]
  );
};
