// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { atom, getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories run before imports, so shared mutable state lives in
// vi.hoisted() — also pre-import.
const refs = vi.hoisted(() => ({
  annotationContext: null as unknown,
  scene: null as unknown,
  onExit: null as unknown,
}));

vi.mock("recoil", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recoil")>();
  return { ...actual, useRecoilValue: () => false };
});

vi.mock("@fiftyone/lighter", () => ({
  UNDEFINED_LIGHTER_SCENE_ID: "undefined-scene",
  useLighter: () => ({ scene: refs.scene }),
  useLighterEventHandler: () => (_e: string, _h: unknown) => {},
}));

vi.mock("@fiftyone/state", () => ({
  isPatchesView: atom(false),
}));

vi.mock("./useAnnotationContext", () => ({
  useAnnotationContext: () => refs.annotationContext,
  useAnnotationFields: () => ({ fields: [] as string[] }),
}));

vi.mock("./useExit", () => ({
  default: () => refs.onExit,
}));

import {
  createMockAnnotationContext,
  createMockScene,
  type MockAnnotationContext,
  type MockScene,
} from "./__testing__/mocks";

const { useDetectionMode, _unsafeDetectionModeActiveAtom } =
  await import("./useDetectionMode");

// ── Tests ────────────────────────────────────────────────────────────────────

const store = getDefaultStore();

// Typed accessors so tests read `annotationContext().clear` etc.
const annotationContext = () => refs.annotationContext as MockAnnotationContext;
const scene = () => refs.scene as MockScene;
const onExit = () => refs.onExit as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  store.set(_unsafeDetectionModeActiveAtom, false);
  refs.annotationContext = createMockAnnotationContext();
  refs.scene = createMockScene();
  refs.onExit = vi.fn();
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

      expect(onExit()).not.toHaveBeenCalled();
      expect(annotationContext().clear).not.toHaveBeenCalled();
      expect(scene().exitInteractiveMode).not.toHaveBeenCalled();
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

    it("finalizes the current detection (scene().exitInteractiveMode + clear + onExit)", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.activateDetectionMode());
      act(() => result.current.deactivateDetectionMode());

      expect(scene().exitInteractiveMode).toHaveBeenCalledOnce();
      expect(annotationContext().clear).toHaveBeenCalledOnce();
      expect(onExit()).toHaveBeenCalledOnce();
    });
  });

  describe("toggleDetectionMode", () => {
    it("enables detection mode when inactive without firing exit chain", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.toggleDetectionMode());

      expect(result.current.detectionModeActive).toBe(true);
      expect(onExit()).not.toHaveBeenCalled();
      expect(annotationContext().clear).not.toHaveBeenCalled();
      expect(scene().exitInteractiveMode).not.toHaveBeenCalled();
    });

    it("disables and finalizes when active", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.activateDetectionMode());
      act(() => result.current.toggleDetectionMode());

      expect(result.current.detectionModeActive).toBe(false);
      expect(onExit()).toHaveBeenCalledOnce();
      expect(annotationContext().clear).toHaveBeenCalledOnce();
      expect(scene().exitInteractiveMode).toHaveBeenCalledOnce();
    });
  });

  describe("create", () => {
    it("calls scene().exitInteractiveMode then annotationContext.createNew(DETECTION)", () => {
      const { result } = renderHook(() => useDetectionMode());

      act(() => result.current.create());

      expect(scene().exitInteractiveMode).toHaveBeenCalledOnce();
      expect(annotationContext().createNew).toHaveBeenCalledOnce();
      // field/class resolve from last-used memory → configured schema field
      expect(annotationContext().createNew).toHaveBeenCalledWith("Detection");
    });
  });

  describe("auto-activation", () => {
    it("activates when a non-mask Detection label is selected", () => {
      refs.annotationContext = createMockAnnotationContext({
        selected: {
          label: { type: "Detection", data: {} },
          type: "Detection",
        },
      });

      const { result } = renderHook(() => useDetectionMode());

      expect(result.current.detectionModeActive).toBe(true);
    });

    it("does NOT activate when the selected Detection has a mask", () => {
      refs.annotationContext = createMockAnnotationContext({
        selected: {
          label: { type: "Detection", data: { mask: {} } },
          type: "Detection",
        },
      });

      const { result } = renderHook(() => useDetectionMode());

      expect(result.current.detectionModeActive).toBe(false);
    });

    it("does NOT activate while mid-mask-authoring", () => {
      refs.annotationContext = createMockAnnotationContext({
        selected: {
          label: { type: "Detection", data: {} },
          type: "Detection",
          isEditingMask: true,
        },
      });

      const { result } = renderHook(() => useDetectionMode());

      expect(result.current.detectionModeActive).toBe(false);
    });
  });
});
