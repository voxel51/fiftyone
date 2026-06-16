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
  selectedLabelRef: {
    value: null as null | { overlay?: { id: string } },
  },
}));

vi.mock("@fiftyone/annotation/src/agents", () => ({
  AgentTaskType: hoisted.AgentTaskType,
  useActiveTask: () => ({
    activeTask: null,
    setActiveTask: hoisted.activeTaskSpies.setActiveTask,
  }),
  useAgentSelector: () => hoisted.agentSelectorRef.value,
  usePointSelection: () => hoisted.pointSelectionSpies,
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
        hoisted.AgentTaskType.SEGMENT
      );
      expect(hoisted.pointSelectionSpies.activate).toHaveBeenCalledTimes(1);
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
    it("deactivates point selection, clears prompt + tools state, clears task, flips isActive", () => {
      const { result } = renderHook(() => useAIAnnotationMode());
      act(() => result.current.activate());

      vi.clearAllMocks();
      act(() => result.current.deactivate());

      expect(hoisted.pointSelectionSpies.deactivate).toHaveBeenCalledTimes(1);
      expect(hoisted.pointSelectionSpies.clearPoints).toHaveBeenCalledTimes(1);
      expect(hoisted.toolsStateSpies.reset).toHaveBeenCalledTimes(1);
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
      hoisted.agentSelectorRef.value = {
        isResolved: true,
        activeAgent: undefined,
        agents: [{ id: "agent-1" }, { id: "agent-2" }],
        setActiveAgent: vi.fn(),
      };

      renderHook(() => useAIAnnotationMode());

      expect(
        (hoisted.agentSelectorRef.value as { setActiveAgent: ReturnType<typeof vi.fn> })
          .setActiveAgent
      ).toHaveBeenCalledWith({ id: "agent-1" });
    });

    it("does NOT change the active agent when one is already selected", () => {
      renderHook(() => useAIAnnotationMode());
      expect(
        (hoisted.agentSelectorRef.value as { setActiveAgent: ReturnType<typeof vi.fn> })
          .setActiveAgent
      ).not.toHaveBeenCalled();
    });

    it("does NOT auto-select before the selector has resolved", () => {
      hoisted.agentSelectorRef.value = {
        isResolved: false,
        activeAgent: undefined,
        agents: [],
        setActiveAgent: vi.fn(),
      };

      renderHook(() => useAIAnnotationMode());

      expect(
        (hoisted.agentSelectorRef.value as { setActiveAgent: ReturnType<typeof vi.fn> })
          .setActiveAgent
      ).not.toHaveBeenCalled();
    });
  });

  describe("label-reset behavior", () => {
    it("clears prompts (clearPoints + resetToolsState) when the selected label changes WHILE ACTIVE", () => {
      hoisted.selectedLabelRef.value = { overlay: { id: "label-a" } };
      const { result, rerender } = renderHook(() => useAIAnnotationMode());

      act(() => result.current.activate());
      vi.clearAllMocks();

      // Selection switches to a different label.
      hoisted.selectedLabelRef.value = { overlay: { id: "label-b" } };
      rerender();

      expect(hoisted.pointSelectionSpies.clearPoints).toHaveBeenCalledTimes(1);
      expect(hoisted.toolsStateSpies.reset).toHaveBeenCalledTimes(1);
    });

    it("does NOT clear prompts when inactive", () => {
      hoisted.selectedLabelRef.value = { overlay: { id: "label-a" } };
      const { rerender } = renderHook(() => useAIAnnotationMode());

      vi.clearAllMocks();

      hoisted.selectedLabelRef.value = { overlay: { id: "label-b" } };
      rerender();

      expect(hoisted.pointSelectionSpies.clearPoints).not.toHaveBeenCalled();
      expect(hoisted.toolsStateSpies.reset).not.toHaveBeenCalled();
    });

    it("does NOT clear prompts when the same label re-renders (no id change)", () => {
      hoisted.selectedLabelRef.value = { overlay: { id: "label-a" } };
      const { result, rerender } = renderHook(() => useAIAnnotationMode());

      act(() => result.current.activate());
      vi.clearAllMocks();

      rerender();

      expect(hoisted.pointSelectionSpies.clearPoints).not.toHaveBeenCalled();
    });
  });
});
