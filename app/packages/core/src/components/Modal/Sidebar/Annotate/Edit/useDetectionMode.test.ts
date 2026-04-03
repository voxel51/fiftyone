import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { atom } from "jotai";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockOnExit = vi.fn();
const mockCreateDetection = vi.fn();
const mockExitInteractiveMode = vi.fn();

// Stable references to prevent infinite re-renders
const stableScene = {
  exitInteractiveMode: mockExitInteractiveMode,
  isDestroyed: false,
  renderLoopActive: true,
  getEventChannel: () => "test-channel",
};
const stableLighterReturn = { scene: stableScene };
const stableAnnotationContext = { selectedLabel: null };
const noopEventHook = (_event: string, _handler: unknown) => {};

// Stable atoms — atomFamily mocks must return the SAME atom for the same key
const defaultFieldAtom = atom<string | null>(null);
const fieldTypeAtom = atom(null);
const labelSchemaAtom = atom(null);

vi.mock("@fiftyone/lighter", () => ({
  UNDEFINED_LIGHTER_SCENE_ID: "undefined-scene",
  useLighter: () => stableLighterReturn,
  useLighterEventHandler: () => noopEventHook,
}));

vi.mock("../state", () => ({
  fieldType: () => fieldTypeAtom,
  isFieldReadOnly: () => false,
  labelSchemaData: () => labelSchemaAtom,
}));

vi.mock("../useLabels", () => ({
  labelsByPath: atom<Record<string, unknown>>({}),
}));

const currentTypeAtom = atom<string | null>(null);

vi.mock("./state", () => ({
  currentType: currentTypeAtom,
  defaultField: () => defaultFieldAtom,
  useAnnotationContext: () => stableAnnotationContext,
}));

vi.mock("./useCreate", () => ({
  default: () => mockCreateDetection,
}));

vi.mock("./useExit", () => ({
  default: () => mockOnExit,
}));

const { useDetectionMode } = await import("./useDetectionMode");

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useDetectionMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with detectionModeActive=false", () => {
    const { result } = renderHook(() => useDetectionMode());
    expect(result.current.detectionModeActive).toBe(false);
  });

  describe("activateDetectionMode", () => {
    it("sets detectionModeActive to true", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.activateDetectionMode());

      expect(result.current.detectionModeActive).toBe(true);
    });

    it("does not call onExit", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.activateDetectionMode());

      expect(mockOnExit).not.toHaveBeenCalled();
    });
  });

  describe("deactivateDetectionMode", () => {
    it("sets detectionModeActive to false", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.activateDetectionMode());
      expect(result.current.detectionModeActive).toBe(true);

      act(() => result.current.deactivateDetectionMode());
      expect(result.current.detectionModeActive).toBe(false);
    });

    it("does not call onExit", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.activateDetectionMode());
      act(() => result.current.deactivateDetectionMode());

      expect(mockOnExit).not.toHaveBeenCalled();
    });
  });

  describe("toggleDetectionMode", () => {
    it("enables detection mode when inactive", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.toggleDetectionMode());

      expect(result.current.detectionModeActive).toBe(true);
      expect(mockOnExit).not.toHaveBeenCalled();
    });

    it("disables detection mode and finalizes detection when active", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.activateDetectionMode());
      act(() => result.current.toggleDetectionMode());

      expect(result.current.detectionModeActive).toBe(false);
      expect(mockOnExit).toHaveBeenCalledOnce();
      expect(mockExitInteractiveMode).toHaveBeenCalledOnce();
    });

    it("does not call onExit or exitInteractiveMode when toggling on", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.toggleDetectionMode());

      expect(mockOnExit).not.toHaveBeenCalled();
      expect(mockExitInteractiveMode).not.toHaveBeenCalled();
    });
  });
});
