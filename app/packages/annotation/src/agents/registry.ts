import { AnnotationAgent, InferenceResultProxy } from "./types";

/**
 * A descriptor of an agent, including a unique ID and human-friendly label
 * with its {@link AnnotationAgent} instance.
 */
export type AgentDescriptor<T extends InferenceResultProxy> = {
  id: string;
  label: string;
  agent: AnnotationAgent<T>;
};

/**
 * Provides discovery and registration of {@link AnnotationAgent}s.
 *
 * Obtain an instance via {@link useAgentRegistry}.
 */
export interface AgentRegistry {
  /** Registers a new agent under the given `id` and human-readable `label`. */
  register(
    id: string,
    label: string,
    agent: AnnotationAgent<InferenceResultProxy>,
  ): Promise<void>;

  /** Returns all currently registered {@link AgentDescriptor}s. */
  listAgents(): Promise<AgentDescriptor<InferenceResultProxy>[]>;
}
