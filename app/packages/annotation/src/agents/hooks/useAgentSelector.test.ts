import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDescriptor } from "../registry";
import type { InferenceResultProxy } from "../types";

const descriptor = (id: string) =>
  ({
    id,
    label: id,
    agent: {},
  }) as unknown as AgentDescriptor<InferenceResultProxy>;

const hoisted = vi.hoisted(() => ({
  agents: [] as unknown[],
}));

// Stable identity: `useAgentSelector` re-loads (and re-renders) whenever the
// registry object changes, so a fresh literal per render would never settle.
const registry = {
  listAgents: async () => hoisted.agents,
  register: async () => undefined,
};

vi.mock("./useAgentRegistry", () => ({
  useAgentRegistry: () => registry,
}));

const STORAGE_KEY = "HA.lastAnnotationAgentId";

/**
 * Load a fresh copy of the module. The persisted atom is module-scoped in
 * jotai's default store, so clearing `localStorage` alone leaves a previous
 * case's selection in memory — and because the atom hydrates with `getOnInit`,
 * a stored id is only read at creation time. Both need a new module instance.
 */
const loadSelector = async () => {
  vi.resetModules();
  return (await import("./useAgentSelector")).useAgentSelector;
};

describe("useAgentSelector", () => {
  beforeEach(() => {
    hoisted.agents = [descriptor("agent-1"), descriptor("agent-2")];
    localStorage.clear();
  });

  it("persists the selected agent's id", async () => {
    const useAgentSelector = await loadSelector();
    const { result } = renderHook(() => useAgentSelector());
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    act(() => result.current.setActiveAgent(descriptor("agent-2")));

    expect(result.current.activeAgent?.id).toBe("agent-2");
    expect(result.current.lastAgentId).toBe("agent-2");
    expect(localStorage.getItem(STORAGE_KEY)).toBe('"agent-2"');
  });

  // The bootstrap's fallback isn't a user choice: remembering it would
  // overwrite the real pick before a late-registering agent shows up.
  it("does not persist a default-agent selection", async () => {
    const useAgentSelector = await loadSelector();
    const { result } = renderHook(() => useAgentSelector());
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    act(() => result.current.setActiveAgent(descriptor("agent-2")));
    act(() => result.current.setDefaultAgent(descriptor("agent-1")));

    expect(result.current.activeAgent?.id).toBe("agent-1");
    expect(result.current.lastAgentId).toBe("agent-2");
    expect(localStorage.getItem(STORAGE_KEY)).toBe('"agent-2"');
  });

  // The dropdown clears the selection when an agent's service goes down;
  // forgetting the pick there would lose it for good.
  it("keeps the remembered id when the selection is cleared", async () => {
    const useAgentSelector = await loadSelector();
    const { result } = renderHook(() => useAgentSelector());
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    act(() => result.current.setActiveAgent(descriptor("agent-2")));
    act(() => result.current.setActiveAgent(null));

    expect(result.current.activeAgent).toBeNull();
    expect(result.current.lastAgentId).toBe("agent-2");
  });

  // The reload path, and the reason the atom hydrates with `getOnInit`: the
  // bootstrap reads `lastAgentId` as soon as the registry resolves, which can
  // beat a mount-time hydration — so it has to be there on the FIRST render.
  // Sampled in the render body, not from `result.current`: by the time the
  // latter is readable, effects have flushed and a mount-time hydration would
  // look identical.
  it("hydrates the remembered id from storage on the first render", async () => {
    localStorage.setItem(STORAGE_KEY, '"agent-2"');

    const useAgentSelector = await loadSelector();
    const seen: (string | null)[] = [];

    renderHook(() => {
      const selector = useAgentSelector();
      seen.push(selector.lastAgentId);
      return selector;
    });

    expect(seen[0]).toBe("agent-2");
  });
});
