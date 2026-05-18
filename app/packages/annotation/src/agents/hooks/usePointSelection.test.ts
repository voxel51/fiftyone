/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// The hook holds module-private jotai atoms (overlay id, active flag,
// handler). We mock jotai with a small atom store the test can reset
// between cases, so test isolation doesn't depend on each case cleaning up.

const hoisted = vi.hoisted(() => {
  type AtomKey = { __key: number; initial: unknown };
  let counter = 0;
  const initials = new Map<number, unknown>();
  const store = new Map<number, unknown>();

  const atom = <T>(initial: T): AtomKey => {
    const key = ++counter;
    initials.set(key, initial);
    return { __key: key, initial };
  };

  const read = (a: AtomKey): unknown =>
    store.has(a.__key) ? store.get(a.__key) : initials.get(a.__key);

  const write = (a: AtomKey, value: unknown): void => {
    const next =
      typeof value === "function"
        ? (value as (prev: unknown) => unknown)(read(a))
        : value;
    store.set(a.__key, next);
  };

  return {
    atom,
    read,
    write,
    reset: () => store.clear(),
    // collaborators that the test mutates per-case
    sceneRef: { value: undefined as unknown },
    overlayFactoryRef: { value: undefined as unknown },
    getOverlayRef: { value: vi.fn() },
    eventBusRef: { value: { id: "event-bus" } },
    selectedLabelRef: { value: null as unknown },
    // a real class so `instanceof KeypointOverlay` works in clearPoints
    KeypointOverlay: class KeypointOverlay {
      public id = "ko-id";
      public clearPoints = vi.fn();
    },
    // a constructor stub so we can spy on `new InteractiveKeypointHandler(...)`
    InteractiveKeypointHandler: vi
      .fn()
      .mockImplementation(function (this: { pruneCommands: ReturnType<typeof vi.fn> }) {
        this.pruneCommands = vi.fn();
      }),
  };
});

vi.mock("jotai", () => ({
  atom: hoisted.atom,
  useAtom: (a: { __key: number; initial: unknown }) =>
    [
      hoisted.read(a),
      (value: unknown) => hoisted.write(a, value),
    ] as const,
  getDefaultStore: () => ({
    get: hoisted.read,
    set: hoisted.write,
  }),
}));

vi.mock("@fiftyone/lighter", () => ({
  // Both classes are referenced as values (constructor / instanceof).
  KeypointOverlay: hoisted.KeypointOverlay,
  KeypointPointHitAction: { DELETE: "DELETE" },
  InteractiveKeypointHandler: hoisted.InteractiveKeypointHandler,
  UNDEFINED_LIGHTER_SCENE_ID: "UNDEFINED_LIGHTER_SCENE_ID",
  useLighter: () => ({
    scene: hoisted.sceneRef.value,
    overlayFactory: hoisted.overlayFactoryRef.value,
    getOverlay: hoisted.getOverlayRef.value,
  }),
  useLighterEventBus: () => hoisted.eventBusRef.value,
}));

vi.mock("@fiftyone/utilities", () => ({}));

vi.mock(
  "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state",
  () => ({
    useAnnotationContext: () => ({
      selectedLabel: hoisted.selectedLabelRef.value,
    }),
  })
);

// Pure helper imported by the hook — keep its real implementation; it's
// the dependency under collaboration, not under test.
vi.mock("./resolvePointVariant", async (importOriginal) => {
  const orig = (await importOriginal()) as object;
  return orig;
});

import { usePointSelection } from "./usePointSelection";

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeScene = () => ({
  getEventChannel: vi.fn().mockReturnValue("test-channel"),
  addOverlay: vi.fn(),
  removeOverlay: vi.fn(),
  enterInteractiveMode: vi.fn(),
  exitInteractiveMode: vi.fn(),
});

const makeOverlayFactory = (created: { id: string }) => ({
  create: vi.fn().mockReturnValue(created),
});

const setupActiveScene = () => {
  const createdOverlay = { id: "kp-overlay-1" };
  const scene = makeScene();
  hoisted.sceneRef.value = scene;
  hoisted.overlayFactoryRef.value = makeOverlayFactory(createdOverlay);
  return { scene, createdOverlay };
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("usePointSelection", () => {
  beforeEach(() => {
    hoisted.reset();
    hoisted.sceneRef.value = undefined;
    hoisted.overlayFactoryRef.value = undefined;
    hoisted.getOverlayRef.value = vi.fn();
    hoisted.selectedLabelRef.value = null;
    hoisted.InteractiveKeypointHandler.mockClear();
  });

  it("initial state: isActive=false", () => {
    setupActiveScene();
    const { result } = renderHook(() => usePointSelection());
    expect(result.current.isActive).toBe(false);
  });

  describe("activate", () => {
    it("creates a keypoint overlay, adds it to the scene, and enters interactive mode", () => {
      const { scene, createdOverlay } = setupActiveScene();
      const { result, rerender } = renderHook(() => usePointSelection());

      act(() => result.current.activate());
      rerender();

      const factoryCreate = (hoisted.overlayFactoryRef.value as {
        create: ReturnType<typeof vi.fn>;
      }).create;
      expect(factoryCreate).toHaveBeenCalledWith(
        "keypoint",
        expect.objectContaining({
          field: "",
          variantStyles: expect.any(Object),
        })
      );
      expect(scene.addOverlay).toHaveBeenCalledWith(createdOverlay);
      expect(scene.enterInteractiveMode).toHaveBeenCalledTimes(1);
      expect(hoisted.InteractiveKeypointHandler).toHaveBeenCalledTimes(1);
      expect(result.current.isActive).toBe(true);
    });

    it("is idempotent: a second activate while already active is a no-op", () => {
      const { scene } = setupActiveScene();
      const { result, rerender } = renderHook(() => usePointSelection());

      act(() => result.current.activate());
      rerender();
      act(() => result.current.activate());

      expect(scene.addOverlay).toHaveBeenCalledTimes(1);
      expect(scene.enterInteractiveMode).toHaveBeenCalledTimes(1);
      expect(hoisted.InteractiveKeypointHandler).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when the scene is not yet initialized", () => {
      // sceneRef.value defaults to undefined in beforeEach
      hoisted.overlayFactoryRef.value = makeOverlayFactory({ id: "x" });

      const { result } = renderHook(() => usePointSelection());
      act(() => result.current.activate());

      expect(hoisted.InteractiveKeypointHandler).not.toHaveBeenCalled();
      expect(result.current.isActive).toBe(false);
    });
  });

  describe("deactivate", () => {
    it("prunes the handler's commands, exits interactive mode, removes the overlay, and clears state", () => {
      const { scene, createdOverlay } = setupActiveScene();
      const { result, rerender } = renderHook(() => usePointSelection());

      act(() => result.current.activate());
      rerender();

      const handlerInstance = hoisted.InteractiveKeypointHandler.mock
        .instances[0] as { pruneCommands: ReturnType<typeof vi.fn> };

      act(() => result.current.deactivate());
      rerender();

      expect(handlerInstance.pruneCommands).toHaveBeenCalledTimes(1);
      expect(scene.exitInteractiveMode).toHaveBeenCalledTimes(1);
      expect(scene.removeOverlay).toHaveBeenCalledWith(createdOverlay.id);
      expect(result.current.isActive).toBe(false);
    });

    it("is idempotent: deactivate when already inactive is a no-op", () => {
      const { scene } = setupActiveScene();
      const { result } = renderHook(() => usePointSelection());

      act(() => result.current.deactivate());

      expect(scene.exitInteractiveMode).not.toHaveBeenCalled();
      expect(scene.removeOverlay).not.toHaveBeenCalled();
      expect(result.current.isActive).toBe(false);
    });

    // Same-tick activate→deactivate with no re-render between exposes a
    // stale-closure risk: the cleanup branch closure-captures
    // `interactiveHandler` and `keypointOverlayId` from useAtom (only the
    // idempotency guard reads fresh from the store). If the cleanup keeps
    // relying on closures, this test fails — making it a regression net
    // for any future refactor that re-introduces the stale-closure shape.
    it("activate followed by immediate deactivate (same tick, no re-render) still tears down the handler and removes the overlay", () => {
      const { scene, createdOverlay } = setupActiveScene();
      const { result } = renderHook(() => usePointSelection());

      act(() => {
        result.current.activate();
        result.current.deactivate();
      });

      const handlerInstance = hoisted.InteractiveKeypointHandler.mock
        .instances[0] as { pruneCommands: ReturnType<typeof vi.fn> };

      expect(handlerInstance.pruneCommands).toHaveBeenCalledTimes(1);
      expect(scene.exitInteractiveMode).toHaveBeenCalledTimes(1);
      expect(scene.removeOverlay).toHaveBeenCalledWith(createdOverlay.id);
      expect(result.current.isActive).toBe(false);
    });
  });

  describe("clearPoints", () => {
    it("calls clearPoints() on the active KeypointOverlay", () => {
      setupActiveScene();
      const liveOverlay = new hoisted.KeypointOverlay();
      hoisted.getOverlayRef.value = vi.fn().mockReturnValue(liveOverlay);

      const { result, rerender } = renderHook(() => usePointSelection());
      act(() => result.current.activate());
      rerender();

      act(() => result.current.clearPoints());

      expect(liveOverlay.clearPoints).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when nothing is active (no overlay id)", () => {
      setupActiveScene();
      const liveOverlay = new hoisted.KeypointOverlay();
      hoisted.getOverlayRef.value = vi.fn().mockReturnValue(liveOverlay);

      const { result } = renderHook(() => usePointSelection());
      // never activated
      act(() => result.current.clearPoints());

      expect(liveOverlay.clearPoints).not.toHaveBeenCalled();
    });

    it("is a no-op when the resolved overlay is not a KeypointOverlay", () => {
      setupActiveScene();
      // Return a plain object — `instanceof KeypointOverlay` will be false
      const wrongTypeOverlay = { clearPoints: vi.fn() };
      hoisted.getOverlayRef.value = vi.fn().mockReturnValue(wrongTypeOverlay);

      const { result, rerender } = renderHook(() => usePointSelection());
      act(() => result.current.activate());
      rerender();

      act(() => result.current.clearPoints());

      expect(wrongTypeOverlay.clearPoints).not.toHaveBeenCalled();
    });
  });

  describe("activate → deactivate → activate (full cycle)", () => {
    it("can re-activate after deactivating, creating a fresh overlay each time", () => {
      const scene = makeScene();
      hoisted.sceneRef.value = scene;
      let nextId = 0;
      hoisted.overlayFactoryRef.value = {
        create: vi.fn().mockImplementation(() => ({
          id: `kp-${++nextId}`,
        })),
      };

      const { result, rerender } = renderHook(() => usePointSelection());

      act(() => result.current.activate());
      rerender();
      act(() => result.current.deactivate());
      rerender();
      act(() => result.current.activate());
      rerender();

      expect(scene.addOverlay).toHaveBeenCalledTimes(2);
      expect(scene.enterInteractiveMode).toHaveBeenCalledTimes(2);
      expect(scene.removeOverlay).toHaveBeenCalledTimes(1);
      expect(hoisted.InteractiveKeypointHandler).toHaveBeenCalledTimes(2);
      expect(result.current.isActive).toBe(true);
    });

    // Same-tick activate→deactivate→activate (no re-renders between) — the
    // immediate-toggle variant of the full-cycle test. Mirrors the
    // stale-closure regression net inside `describe("deactivate")` but
    // verifies the FULL cycle remains observably correct: the first
    // session's overlay/handler get torn down before the second session's
    // are installed.
    it("immediate full-cycle (no re-renders between) — same observable state as the rerendered version", () => {
      const scene = makeScene();
      hoisted.sceneRef.value = scene;
      let nextId = 0;
      hoisted.overlayFactoryRef.value = {
        create: vi.fn().mockImplementation(() => ({
          id: `kp-${++nextId}`,
        })),
      };

      const { result, rerender } = renderHook(() => usePointSelection());

      act(() => {
        result.current.activate();
        result.current.deactivate();
        result.current.activate();
      });
      // Trailing rerender() to flush React state — same convention as the
      // other tests in this file. The "no re-render" property under test
      // is the absence of a rerender BETWEEN the activate/deactivate
      // calls, not after them.
      rerender();

      expect(scene.addOverlay).toHaveBeenCalledTimes(2);
      expect(scene.enterInteractiveMode).toHaveBeenCalledTimes(2);
      expect(scene.removeOverlay).toHaveBeenCalledTimes(1);
      expect(hoisted.InteractiveKeypointHandler).toHaveBeenCalledTimes(2);
      expect(result.current.isActive).toBe(true);
    });
  });
});
