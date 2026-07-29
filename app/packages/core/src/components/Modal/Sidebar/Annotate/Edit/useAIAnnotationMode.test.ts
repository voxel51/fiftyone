/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  AgentTaskType: {
    SEGMENT: "segment",
    DETECT: "detect",
    CLASSIFY: "classify",
    INFER: "infer",
  },
  activeTaskSpies: {
    setActiveTask: vi.fn(),
  },
  agentSelectorRef: {
    value: {
      isResolved: true,
      activeAgent: { id: "agent-1" },
      agents: [{ id: "agent-1" }],
      setActiveAgent: vi.fn(),
    } as Record<string, unknown>,
  },
  pointSelectionSpies: {
    activate: vi.fn(),
    deactivate: vi.fn(),
    clearPoints: vi.fn(),
    isActive: false,
  },
  toolsStateSpies: {
    reset: vi.fn(),
  },
  pointSelectionSeedSpies: {
    markSeedNew: vi.fn(),
    consumeSeedNew: vi.fn(() => false),
    clearSeedNew: vi.fn(),
  },
  // The combined overlay-points + prompt-state clear; covered end to end in
  // `useClearPointPrompts.test.ts`.
  clearPointPrompts: vi.fn(),
  selectedLabelRef: {
    value: null as null | { overlay?: { id: string } },
  },
}));

vi.mock("@fiftyone/annotation/src/agents", () => ({
  AgentTaskType: hoisted.AgentTaskType,
  isAgentSelectable: (d: { available?: boolean; unlisted?: boolean }) =>
    d.available !== false && !d.unlisted,
  useActiveTask: () => ({
    activeTask: null,
    setActiveTask: hoisted.activeTaskSpies.setActiveTask,
  }),
  useAgentSelector: () => hoisted.agentSelectorRef.value,
  useClearPointPrompts: () => hoisted.clearPointPrompts,
  usePointSelection: () => hoisted.pointSelectionSpies,
  usePointSelectionSeed: () => hoisted.pointSelectionSeedSpies,
  useToolsState: () => hoisted.toolsStateSpies,
}));

vi.mock("./useAnnotationContext", () => ({
  useAnnotationContext: () => ({
    selected: hoisted.selectedLabelRef.value
      ? { label: hoisted.selectedLabelRef.value }
      : null,
  }),
}));

import { useAIAnnotationMode } from "./useAIAnnotationMode";

// ── Helpers ──────────────────────────────────────────────────────────────────

const resetMode = (result: {
  current: ReturnType<typeof useAIAnnotationMode>;
}) => {
  act(() => result.current.deactivate());
};

type SelectorSpies = {
  setActiveAgent: ReturnType<typeof vi.fn>;
  setDefaultAgent: ReturnType<typeof vi.fn>;
};

/** Installs a selector state for the bootstrap to read; returns its spies. */
const givenSelector = (state: Record<string, unknown>): SelectorSpies => {
  hoisted.agentSelectorRef.value = {
    isResolved: true,
    activeAgent: undefined,
    agents: [],
    lastAgentId: null,
    setActiveAgent: vi.fn(),
    setDefaultAgent: vi.fn(),
    ...state,
  };

  return hoisted.agentSelectorRef.value as SelectorSpies;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useAIAnnotationMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectedLabelRef.value = null;
    hoisted.pointSelectionSpies.isActive = false;
    hoisted.agentSelectorRef.value = {
      isResolved: true,
      activeAgent: { id: "agent-1" },
      agents: [{ id: "agent-1" }],
      setActiveAgent: vi.fn(),
      setDefaultAgent: vi.fn(),
    };
  });

  afterEach(() => {
    const { result } = renderHook(() => useAIAnnotationMode());
    resetMode(result);
  });

  it("initial state: isActive=false", () => {
    const { result } = renderHook(() => useAIAnnotationMode());
    expect(result.current.isActive).toBe(false);
  });

  describe("activate", () => {
    it("sets active task to SEGMENT, flips isActive, and activates point selection", () => {
      const { result } = renderHook(() => useAIAnnotationMode());

      act(() => result.current.activate());

      expect(hoisted.activeTaskSpies.setActiveTask).toHaveBeenCalledWith(
        hoisted.AgentTaskType.SEGMENT,
      );
      expect(hoisted.pointSelectionSpies.activate).toHaveBeenCalledTimes(1);
      // A fresh session refines the selection by default — the seed-new flag
      // (set only by a finalize) is cleared on activation.
      expect(
        hoisted.pointSelectionSeedSpies.clearSeedNew,
      ).toHaveBeenCalledTimes(1);
      expect(result.current.isActive).toBe(true);
    });

    it("is idempotent: a second activate while already active is a no-op", () => {
      const { result } = renderHook(() => useAIAnnotationMode());

      act(() => result.current.activate());
      act(() => result.current.activate());

      expect(hoisted.activeTaskSpies.setActiveTask).toHaveBeenCalledTimes(1);
      expect(hoisted.pointSelectionSpies.activate).toHaveBeenCalledTimes(1);
    });
  });

  describe("deactivate", () => {
    it("deactivates point selection, clears the point prompts, clears task, flips isActive", () => {
      const { result } = renderHook(() => useAIAnnotationMode());
      act(() => result.current.activate());

      vi.clearAllMocks();
      act(() => result.current.deactivate());

      expect(hoisted.pointSelectionSpies.deactivate).toHaveBeenCalledTimes(1);
      expect(hoisted.clearPointPrompts).toHaveBeenCalledTimes(1);
      expect(hoisted.activeTaskSpies.setActiveTask).toHaveBeenCalledWith(null);
      expect(result.current.isActive).toBe(false);
    });

    it("is idempotent: deactivate when already inactive is a no-op", () => {
      const { result } = renderHook(() => useAIAnnotationMode());

      act(() => result.current.deactivate());

      expect(hoisted.pointSelectionSpies.deactivate).not.toHaveBeenCalled();
      expect(hoisted.activeTaskSpies.setActiveTask).not.toHaveBeenCalled();
    });
  });

  describe("default-agent bootstrap", () => {
    it("auto-selects the first agent when none is active and the selector has resolved", () => {
      const spies = givenSelector({
        agents: [{ id: "agent-1" }, { id: "agent-2" }],
      });

      renderHook(() => useAIAnnotationMode());

      expect(spies.setDefaultAgent).toHaveBeenCalledWith({ id: "agent-1" });
    });

    // The fallback is not a user choice. Persisting it would overwrite the
    // remembered pick on every reload — and it always would, because a
    // service-backed agent isn't registered yet on the first resolve.
    it("does NOT remember the fallback it picked", () => {
      const spies = givenSelector({
        agents: [{ id: "agent-1" }],
        lastAgentId: "agent-2",
      });

      renderHook(() => useAIAnnotationMode());

      expect(spies.setDefaultAgent).toHaveBeenCalledWith({ id: "agent-1" });
      expect(spies.setActiveAgent).not.toHaveBeenCalled();
    });

    it("does NOT change the active agent when one is already selected", () => {
      renderHook(() => useAIAnnotationMode());

      const spies = hoisted.agentSelectorRef.value as SelectorSpies;
      expect(spies.setDefaultAgent).not.toHaveBeenCalled();
      expect(spies.setActiveAgent).not.toHaveBeenCalled();
    });

    it("restores the remembered agent rather than the first one", () => {
      const spies = givenSelector({
        agents: [{ id: "agent-1" }, { id: "agent-2" }],
        lastAgentId: "agent-2",
      });

      renderHook(() => useAIAnnotationMode());

      expect(spies.setDefaultAgent).toHaveBeenCalledWith({ id: "agent-2" });
    });

    it("falls back to the first agent when the remembered one isn't selectable", () => {
      const spies = givenSelector({
        // The remembered agent is registered but its service is down.
        agents: [{ id: "agent-1" }, { id: "agent-2", available: false }],
        lastAgentId: "agent-2",
      });

      renderHook(() => useAIAnnotationMode());

      expect(spies.setDefaultAgent).toHaveBeenCalledWith({ id: "agent-1" });
    });

    // Service-backed agents register after the static ones, so the remembered
    // pick is routinely absent on the first resolve and must still be adopted
    // when it lands.
    it("adopts the remembered agent when it registers after the fallback", () => {
      const spies = givenSelector({
        activeAgent: { id: "agent-1" },
        agents: [{ id: "agent-1" }],
        lastAgentId: "agent-2",
      });

      const { rerender } = renderHook(() => useAIAnnotationMode());
      expect(spies.setDefaultAgent).not.toHaveBeenCalled();

      const late = givenSelector({
        activeAgent: { id: "agent-1" },
        agents: [{ id: "agent-1" }, { id: "agent-2" }],
        lastAgentId: "agent-2",
      });
      rerender();

      expect(late.setDefaultAgent).toHaveBeenCalledWith({ id: "agent-2" });
    });

    it("does NOT auto-select before the selector has resolved", () => {
      const spies = givenSelector({ isResolved: false });

      renderHook(() => useAIAnnotationMode());

      expect(spies.setDefaultAgent).not.toHaveBeenCalled();
    });
  });

  describe("selection changes do not touch the point context", () => {
    // The SAM2 point context is reset only at real session boundaries
    // (deactivate, and the deactivate→activate cycle a finalize runs) — NOT on
    // selection changes. An inference creating + selecting a fresh mask IS a
    // selection change, so clearing here wiped the seed point of every mask
    // after the first. This is the regression guard for that bug.
    it("does NOT clear prompts when the selected label changes WHILE ACTIVE", () => {
      hoisted.selectedLabelRef.value = { overlay: { id: "label-a" } };
      const { result, rerender } = renderHook(() => useAIAnnotationMode());

      act(() => result.current.activate());
      vi.clearAllMocks();

      // Selection switches to a different label (e.g. inference just created
      // and selected a new mask).
      hoisted.selectedLabelRef.value = { overlay: { id: "label-b" } };
      rerender();

      expect(hoisted.clearPointPrompts).not.toHaveBeenCalled();
    });
  });
});
