import { createContext, useContext } from "react";
import type {
  TemporalTagModeActions,
  TemporalTagModeState,
} from "./use-temporal-tag-mode";

export interface TemporalTagCreatePayload {
  readonly start: number;
  readonly end: number;
  readonly tag: string;
  readonly anchor?: string;
}

export interface TemporalTagContextValue {
  readonly state: TemporalTagModeState;
  readonly actions: TemporalTagModeActions;
  /** Callback to create a tag via the backend. Undefined when temporal
   *  tagging is not wired in (no op-guard needed at call sites). */
  readonly onTagCreate?: (tag: TemporalTagCreatePayload) => Promise<void>;
  /** Tag labels already present on the timeline. Used to populate the
   *  "add to existing tag" dropdown in the creation popup. */
  readonly existingTags?: readonly string[];
}

const TemporalTagContext = createContext<TemporalTagContextValue | null>(null);

export const TemporalTagProvider = TemporalTagContext.Provider;

/**
 * Returns the current temporal-tag mode context.  Returns `null` when
 * rendered outside a `<TemporalTagProvider>` so callers can
 * conditionally show the tagging UI.
 */
export function useTemporalTagContext(): TemporalTagContextValue | null {
  return useContext(TemporalTagContext);
}
