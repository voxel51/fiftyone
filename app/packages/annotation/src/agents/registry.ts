import { AnnotationAgent, InferenceResultProxy } from "./types";

/**
 * A descriptor of an agent, including a unique ID and human-friendly label
 * with its {@link AnnotationAgent} instance.
 */
export type AgentDescriptor<T extends InferenceResultProxy> = {
  id: string;
  label: string;
  agent: AnnotationAgent<T>;
  /**
   * Whether the agent can currently be selected. Service-backed agents set
   * this to `false` while their service isn't running so the selector hides
   * them. Omitted/`true` means always selectable (e.g. in-browser agents).
   */
  available?: boolean;
  /**
   * Whether the agent is hidden from user selection; intended for use by
   * internal agents.
   */
  unlisted?: boolean;
};

/**
 * Whether an agent may be chosen by the user: excludes the unavailable (a
 * service-backed agent whose service isn't running) and the unlisted (resolved
 * programmatically, never surfaced). The selector and the default-agent
 * bootstrap both filter on this so they can't disagree about the valid set.
 */
export const isAgentSelectable = <T extends InferenceResultProxy>(
  descriptor: AgentDescriptor<T>,
): boolean => descriptor.available !== false && !descriptor.unlisted;

/**
 * Provides discovery and registration of {@link AnnotationAgent}s.
 *
 * Obtain an instance via {@link useAgentRegistry}.
 */
export interface AgentRegistry {
  /**
   * Registers (or updates) an agent under the given `id` and human-readable
   * `label`. Pass `available: false` to keep it registered but unselectable;
   * pass `unlisted: true` for an agent resolved programmatically that should
   * never appear in the selector.
   */
  register(
    id: string,
    label: string,
    agent: AnnotationAgent<InferenceResultProxy>,
    available?: boolean,
    unlisted?: boolean,
  ): Promise<void>;

  /** Returns all currently registered {@link AgentDescriptor}s. */
  listAgents(): Promise<AgentDescriptor<InferenceResultProxy>[]>;
}
