import {
  type AnnotationAgent,
  type PropagationInferenceResult,
  useAgentRegistry,
} from "@fiftyone/annotation";
import { useCallback } from "react";

/** Resolves a registered agent by id, or `null` when absent. */
export const useResolveAgent = () => {
  const registry = useAgentRegistry();

  return useCallback(
    async (
      id: string,
    ): Promise<AnnotationAgent<PropagationInferenceResult> | null> => {
      const agents = await registry.listAgents();
      const descriptor = agents.find((a) => a.id === id);

      return descriptor
        ? (descriptor.agent as AnnotationAgent<PropagationInferenceResult>)
        : null;
    },
    [registry],
  );
};
