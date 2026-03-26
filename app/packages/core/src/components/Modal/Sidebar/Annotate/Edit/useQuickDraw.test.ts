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

const { useQuickDraw } = await import("./useQuickDraw");

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useQuickDraw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with quickDrawActive=false", () => {
    const { result } = renderHook(() => useQuickDraw());
    expect(result.current.quickDrawActive).toBe(false);
  });

  describe("enableQuickDraw", () => {
    it("sets quickDrawActive to true", () => {
      const { result } = renderHook(() => useQuickDraw());

      act(() => result.current.enableQuickDraw());

      expect(result.current.quickDrawActive).toBe(true);
    });

    it("does not call onExit", () => {
      const { result } = renderHook(() => useQuickDraw());

      act(() => result.current.enableQuickDraw());

      expect(mockOnExit).not.toHaveBeenCalled();
    });
  });

  describe("disableQuickDraw", () => {
    it("sets quickDrawActive to false", () => {
      const { result } = renderHook(() => useQuickDraw());

      act(() => result.current.enableQuickDraw());
      expect(result.current.quickDrawActive).toBe(true);

      act(() => result.current.disableQuickDraw());
      expect(result.current.quickDrawActive).toBe(false);
    });

    it("does not call onExit", () => {
      const { result } = renderHook(() => useQuickDraw());

      act(() => result.current.enableQuickDraw());
      act(() => result.current.disableQuickDraw());

      expect(mockOnExit).not.toHaveBeenCalled();
    });
  });

  describe("toggleQuickDraw", () => {
    it("enables quick draw when inactive", () => {
      const { result } = renderHook(() => useQuickDraw());

      act(() => result.current.toggleQuickDraw());

      expect(result.current.quickDrawActive).toBe(true);
      expect(mockOnExit).not.toHaveBeenCalled();
    });

    it("disables quick draw and finalizes detection when active", () => {
      const { result } = renderHook(() => useQuickDraw());

      act(() => result.current.enableQuickDraw());
      act(() => result.current.toggleQuickDraw());

      expect(result.current.quickDrawActive).toBe(false);
      expect(mockOnExit).toHaveBeenCalledOnce();
      expect(mockExitInteractiveMode).toHaveBeenCalledOnce();
    });

    it("does not call onExit or exitInteractiveMode when toggling on", () => {
      const { result } = renderHook(() => useQuickDraw());

      act(() => result.current.toggleQuickDraw());

      expect(mockOnExit).not.toHaveBeenCalled();
      expect(mockExitInteractiveMode).not.toHaveBeenCalled();
    });
  });
});
