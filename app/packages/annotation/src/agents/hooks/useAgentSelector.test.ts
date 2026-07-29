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

import { useAgentSelector } from "./useAgentSelector";

const STORAGE_KEY = "HA.lastAnnotationAgentId";

describe("useAgentSelector", () => {
  beforeEach(() => {
    hoisted.agents = [descriptor("agent-1"), descriptor("agent-2")];
    localStorage.clear();
  });

  it("persists the selected agent's id", async () => {
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
    const { result } = renderHook(() => useAgentSelector());
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    act(() => result.current.setActiveAgent(descriptor("agent-2")));
    act(() => result.current.setActiveAgent(null));

    expect(result.current.activeAgent).toBeNull();
    expect(result.current.lastAgentId).toBe("agent-2");
  });
});
