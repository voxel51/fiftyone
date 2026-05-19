import { AgentDescriptor, AgentRegistry } from "../registry";
import { atom, useAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { AnnotationAgent, InferenceResultProxy } from "../types";
import { SAM2BrowserAnnotationAgent } from "../SAM2BrowserAnnotationAgent";

/** Maps agent IDs to their {@link AgentDescriptor} entries. */
type RegistryMap = Record<string, AgentDescriptor<InferenceResultProxy>>;

const registryAtom = atom<RegistryMap>({
  // built-in agents defined statically
  "sam2-tiny-onnx": {
    id: "sam2-tiny-onnx",
    label: "SAM2",
    agent: new SAM2BrowserAnnotationAgent(),
  },
});

/**
 * Hook which provides the active {@link AgentRegistry}.
 *
 * This serves as the canonical method for obtaining methods to register and
 * list available agents.
 */
export const useAgentRegistry = (): AgentRegistry => {
  const [registry, setRegistry] = useAtom(registryAtom);

  const register = useCallback(
    async (
      id: string,
      label: string,
      agent: AnnotationAgent<InferenceResultProxy>
    ) => setRegistry((prev) => ({ ...prev, [id]: { id, label, agent } })),
    [setRegistry]
  );

  const listAgents = useCallback(
    async () => Object.values(registry),
    [registry]
  );

  return useMemo(() => ({ listAgents, register }), [listAgents, register]);
};
