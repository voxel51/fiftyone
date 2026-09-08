import { atom, useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { AgentDescriptor } from "../registry";
import { useAgentRegistry } from "./useAgentRegistry";
import { useCallback, useEffect, useMemo, useState } from "react";
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

  /**
   * Id of the agent the user last picked, persisted across reloads. The
   * default-agent bootstrap prefers it over the first selectable agent so the
   * pick sticks. `null` until the user has chosen one.
   */
  lastAgentId: string | null;

  /** Set the active agent, remembering it as {@link lastAgentId}. */
  setActiveAgent: (
    descriptor: AgentDescriptor<InferenceResultProxy> | null,
  ) => void;

  /**
   * Set the active agent WITHOUT remembering it — for the default-agent
   * bootstrap. Persisting a fallback would overwrite the user's pick with
   * whatever happened to be registered first, which is the whole thing
   * {@link lastAgentId} exists to survive.
   */
  setDefaultAgent: (descriptor: AgentDescriptor<InferenceResultProxy>) => void;
}

// The initial value carries its type rather than `atom<T | null>(null)`: a bare
// `null` argument matches jotai's read-only `atom(read)` overload under this
// project's non-strict null checks, which types the atom's setter as `never`.
const activeAgentAtom = atom(
  null as AgentDescriptor<InferenceResultProxy> | null,
);
const isResolvedAtom = atom<boolean>(false);

// Only the id is persisted — a descriptor carries a live agent instance, which
// is rebuilt by the registry on every load. `getOnInit` so the stored id is
// readable on the very first render: the default-agent bootstrap fires as soon
// as the registry resolves, which can beat this atom's mount-time hydration.
const lastAgentIdAtom = atomWithStorage<string | null>(
  "HA.lastAnnotationAgentId",
  null,
  undefined,
  { getOnInit: true },
);

/**
 * Hook providing the current {@link AgentSelector} state.
 */
export const useAgentSelector = (): AgentSelector => {
  const [activeAgent, setAgent] = useAtom(activeAgentAtom);
  const [isResolved, setIsResolved] = useAtom(isResolvedAtom);
  const [lastAgentId, setLastAgentId] = useAtom(lastAgentIdAtom);

  const [agents, setAgents] = useState<AgentDescriptor<InferenceResultProxy>[]>(
    () => [],
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

  // A cleared selection (the dropdown drops an agent whose service went down)
  // deliberately leaves `lastAgentId` alone, so the same agent is re-adopted
  // once it's selectable again instead of being forgotten.
  const setActiveAgent = useCallback(
    (descriptor: AgentDescriptor<InferenceResultProxy> | null) => {
      setAgent(descriptor);

      if (descriptor) {
        setLastAgentId(descriptor.id);
      }
    },
    [setAgent, setLastAgentId],
  );

  return useMemo(
    () => ({
      activeAgent,
      agents,
      isResolved,
      lastAgentId,
      setActiveAgent,
      setDefaultAgent: setAgent,
    }),
    [activeAgent, agents, isResolved, lastAgentId, setActiveAgent, setAgent],
  );
};
