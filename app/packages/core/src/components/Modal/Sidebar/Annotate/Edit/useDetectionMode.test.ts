// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { atom, getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockOnExit = vi.fn();
const mockExitInteractiveMode = vi.fn();
const mockClear = vi.fn();
const mockCreateNew = vi.fn();

const stableScene = {
  exitInteractiveMode: mockExitInteractiveMode,
  isDestroyed: false,
  renderLoopActive: true,
  getEventChannel: () => "test-channel",
};
const stableLighterReturn = { scene: stableScene };

// Default annotationContext shape used by the hook. Tests can override per-
// case by mutating `annotationContextState`.
let annotationContextState = {
  selected: {
    label: null as null | { type: string; data: Record<string, unknown> },
    type: null as string | null,
    isEditingMask: false,
  },
  clear: mockClear,
  createNew: mockCreateNew,
};

// Recoil mock must keep `atom` (and other actual exports) intact — the
// @fiftyone/analytics package transitively does `import { atom } from "recoil"`
// at module-load time, and stripping it breaks the entire test process.
vi.mock("recoil", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recoil")>();
  return {
    ...actual,
    useRecoilValue: () => false,
  };
});

vi.mock("@fiftyone/lighter", () => ({
  UNDEFINED_LIGHTER_SCENE_ID: "undefined-scene",
  useLighter: () => stableLighterReturn,
  useLighterEventHandler: () => (_e: string, _h: unknown) => {},
}));

vi.mock("@fiftyone/state", () => ({
  isPatchesView: atom(false),
}));

vi.mock("./useAnnotationContext", () => ({
  useAnnotationContext: () => annotationContextState,
  useAnnotationFields: () => ({ fields: [] as string[] }),
}));

vi.mock("./useExit", () => ({
  default: () => mockOnExit,
}));

const { useDetectionMode, _unsafeDetectionModeActiveAtom } = await import(
  "./useDetectionMode"
);

// ── Tests ────────────────────────────────────────────────────────────────────

const store = getDefaultStore();

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module-level atom so each test starts from a known state.
  store.set(_unsafeDetectionModeActiveAtom, false);
  annotationContextState = {
    selected: { label: null, type: null, isEditingMask: false },
    clear: mockClear,
    createNew: mockCreateNew,
  };
});

describe("useDetectionMode", () => {
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

    it("does not call onExit, clear, or exitInteractiveMode", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.activateDetectionMode());

      expect(mockOnExit).not.toHaveBeenCalled();
      expect(mockClear).not.toHaveBeenCalled();
      expect(mockExitInteractiveMode).not.toHaveBeenCalled();
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

    it("finalizes the current detection (scene.exitInteractiveMode + clear + onExit)", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.activateDetectionMode());
      act(() => result.current.deactivateDetectionMode());

      expect(mockExitInteractiveMode).toHaveBeenCalledOnce();
      expect(mockClear).toHaveBeenCalledOnce();
      expect(mockOnExit).toHaveBeenCalledOnce();
    });
  });

  describe("toggleDetectionMode", () => {
    it("enables detection mode when inactive without firing exit chain", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.toggleDetectionMode());

      expect(result.current.detectionModeActive).toBe(true);
      expect(mockOnExit).not.toHaveBeenCalled();
      expect(mockClear).not.toHaveBeenCalled();
      expect(mockExitInteractiveMode).not.toHaveBeenCalled();
    });

    it("disables and finalizes when active", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.activateDetectionMode());
      act(() => result.current.toggleDetectionMode());

      expect(result.current.detectionModeActive).toBe(false);
      expect(mockOnExit).toHaveBeenCalledOnce();
      expect(mockClear).toHaveBeenCalledOnce();
      expect(mockExitInteractiveMode).toHaveBeenCalledOnce();
    });
  });

  describe("create", () => {
    it("calls scene.exitInteractiveMode then annotationContext.createNew(DETECTION)", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.create());

      expect(mockExitInteractiveMode).toHaveBeenCalledOnce();
      expect(mockCreateNew).toHaveBeenCalledOnce();
      expect(mockCreateNew).toHaveBeenCalledWith("Detection");
    });
  });

  describe("auto-activation", () => {
    it("activates when a non-mask Detection label is selected", () => {
      annotationContextState = {
        selected: {
          label: { type: "Detection", data: {} },
          type: "Detection",
          isEditingMask: false,
        },
        clear: mockClear,
        createNew: mockCreateNew,
      };

      const { result } = renderHook(() => useDetectionMode());

      expect(result.current.detectionModeActive).toBe(true);
    });

    it("does NOT activate when the selected Detection has a mask", () => {
      annotationContextState = {
        selected: {
          label: { type: "Detection", data: { mask: {} } },
          type: "Detection",
          isEditingMask: false,
        },
        clear: mockClear,
        createNew: mockCreateNew,
      };

      const { result } = renderHook(() => useDetectionMode());

      expect(result.current.detectionModeActive).toBe(false);
    });

    it("does NOT activate while mid-mask-authoring", () => {
      annotationContextState = {
        selected: {
          label: { type: "Detection", data: {} },
          type: "Detection",
          isEditingMask: true,
        },
        clear: mockClear,
        createNew: mockCreateNew,
      };

      const { result } = renderHook(() => useDetectionMode());

      expect(result.current.detectionModeActive).toBe(false);
    });
  });
});
