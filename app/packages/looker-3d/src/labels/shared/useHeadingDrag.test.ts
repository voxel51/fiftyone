/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

// `useHeadingDrag` pulls in recoil, r3f and `@fiftyone/*` packages that aren't
// safely importable in isolation under vitest. Mock the boundaries so this
// exercises only the hook's own orchestration: gating, pointer capture, the
// window-listener lifecycle, and commit-vs-cancel on release. The geometry and
// picking it delegates to are covered directly in
// `heading-arrow-geometry.test.ts` / `cuboid-heading-relabel.test.ts`.

const mocks = vi.hoisted(() => ({
  atoms: {
    hoveredHeadingTargetFaceAtom: Symbol("hoveredHeadingTargetFaceAtom"),
    isCurrentlyTransformingAtom: Symbol("isCurrentlyTransformingAtom"),
  },
  atomValues: new Map<symbol, unknown>(),
  setAtom: vi.fn(),
  // Assigned in beforeEach: `vi.hoisted` runs before imports, so THREE isn't
  // constructible here yet.
  camera: null as unknown as THREE.Camera,
  domElement: {} as HTMLCanvasElement,
  // Which face the picker should report for the next pointer move.
  pickedFace: "+z" as string | null,
  relabel: {
    dimensions: [2, 6, 4] as THREE.Vector3Tuple,
    quaternion: [0, 0, 0, 1] as THREE.Vector4Tuple,
  } as {
    dimensions: THREE.Vector3Tuple;
    quaternion: THREE.Vector4Tuple;
  } | null,
  relabelSpy: vi.fn(),
  pickSpy: vi.fn(),
}));

vi.mock("../../state", async () => {
  // resolves to the mocked recoil below, so the accessor hooks share its
  // reactive stand-in and the `mocks.setAtom` spy
  const { useRecoilValue, useSetRecoilState } =
    (await import("recoil")) as unknown as {
      useRecoilValue: (atom: symbol) => unknown;
      useSetRecoilState: (atom: symbol) => (value: unknown) => void;
    };

  return {
    hoveredHeadingTargetFaceAtom: mocks.atoms.hoveredHeadingTargetFaceAtom,
    isCurrentlyTransformingAtom: mocks.atoms.isCurrentlyTransformingAtom,
    useHoveredHeadingTargetFace: () =>
      useRecoilValue(mocks.atoms.hoveredHeadingTargetFaceAtom),
    useSetHoveredHeadingTargetFace: () =>
      useSetRecoilState(mocks.atoms.hoveredHeadingTargetFaceAtom),
    useSetIsCurrentlyTransforming: () =>
      useSetRecoilState(mocks.atoms.isCurrentlyTransformingAtom),
  };
});

// A minimally reactive recoil stand-in: writes notify subscribers so consumers
// re-render and re-read, which is what makes the shared target-face atom
// observable from the hook's return value.
vi.mock("recoil", async () => {
  const React = await import("react");
  const listeners = new Set<() => void>();

  return {
    useRecoilValue: (atom: symbol) => {
      const [, bump] = React.useState(0);

      React.useEffect(() => {
        const listener = () => bump((n) => n + 1);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }, []);

      return mocks.atomValues.get(atom) ?? null;
    },
    // Must be referentially stable, like the real one: a fresh setter each
    // render would invalidate every callback and effect built on it and spin.
    useSetRecoilState: (atom: symbol) =>
      React.useCallback(
        (value: unknown) => {
          const previous = mocks.atomValues.get(atom);
          const next =
            typeof value === "function"
              ? (value as (prev: unknown) => unknown)(previous)
              : value;

          mocks.atomValues.set(atom, next);
          mocks.setAtom(atom, next);

          // Only notify on a real change, again matching recoil, so a
          // no-op write can't drive a render loop.
          if (next !== previous) {
            for (const listener of listeners) {
              listener();
            }
          }
        },
        [atom],
      ),
  };
});

vi.mock("@react-three/fiber", () => {
  // Stable references, as in real r3f where `gl` and `camera` are long-lived
  // instances rather than fresh objects per render.
  const gl = { domElement: mocks.domElement };
  return {
    useThree: () => ({ camera: mocks.camera, gl }),
  };
});

vi.mock("../../utils", () => ({
  toNDC: () => ({ x: 0, y: 0 }),
  toNDCForElement: () => ({ x: 0, y: 0 }),
}));

vi.mock("./heading-arrow-geometry", () => ({
  getHeadingFaceDots: () => [
    { face: "+x", position: [1, 0, 0] },
    { face: "+z", position: [0, 0, 1] },
  ],
  pickNearestHeadingFace: (...args: unknown[]) => {
    mocks.pickSpy(...args);
    return mocks.pickedFace;
  },
}));

vi.mock("../../annotation/cuboid-heading-relabel", () => ({
  computeCuboidHeadingRelabel: (...args: unknown[]) => {
    mocks.relabelSpy(...args);
    return mocks.relabel;
  },
}));

import { useHeadingDrag, type UseHeadingDragOptions } from "./useHeadingDrag";

const DIMENSIONS: THREE.Vector3Tuple = [4, 2, 6];

// Every rendered hook keeps live window listeners, so they must be torn down
// between tests: a still-mounted hook from an earlier test would also react to
// the pointer events fired here and write the shared target-face atom.
const mounted: Array<() => void> = [];

/** Minimal stand-in for a pointer-capturing DOM target. */
function makePointerTarget() {
  const captured = new Set<number>();
  return {
    setPointerCapture: vi.fn((id: number) => captured.add(id)),
    releasePointerCapture: vi.fn((id: number) => captured.delete(id)),
    hasPointerCapture: vi.fn((id: number) => captured.has(id)),
  };
}

function makePointerDownEvent(pointerTarget = makePointerTarget()) {
  const nativeEvent = {
    pointerId: 7,
    target: pointerTarget,
    preventDefault: vi.fn(),
  };
  return {
    event: {
      nativeEvent,
      stopPropagation: vi.fn(),
    } as never,
    nativeEvent,
    pointerTarget,
  };
}

function setup(overrides: Partial<UseHeadingDragOptions> = {}) {
  const onDragStart = vi.fn();
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const onArrowEnter = vi.fn();
  const suppressNextClickRef = { current: false };
  const contentRef = { current: new THREE.Group() };

  const options: UseHeadingDragOptions = {
    labelId: "label-1",
    hoverSource: "main",
    enabled: true,
    dimensions: DIMENSIONS,
    orientation: new THREE.Quaternion(),
    upVector: new THREE.Vector3(0, 0, 1),
    contentRef,
    panelElementRef: { current: null },
    onDragStart,
    onCommit,
    onCancel,
    onArrowEnter,
    suppressNextClickRef,
    ...overrides,
  };

  const rendered = renderHook(
    (props: UseHeadingDragOptions) => useHeadingDrag(props),
    { initialProps: options },
  );
  mounted.push(rendered.unmount);

  return {
    ...rendered,
    options,
    onDragStart,
    onCommit,
    onCancel,
    onArrowEnter,
    suppressNextClickRef,
    contentRef,
  };
}

const firePointerUp = () =>
  act(() => {
    window.dispatchEvent(new Event("pointerup"));
  });

const firePointerMove = () =>
  act(() => {
    window.dispatchEvent(new Event("pointermove"));
  });

describe("useHeadingDrag", () => {
  beforeEach(() => {
    // A real camera, so the hook's project()/distanceTo() calls behave.
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, 100);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    mocks.camera = camera;

    mocks.pickedFace = "+z";
    mocks.relabel = {
      dimensions: [2, 6, 4],
      quaternion: [0, 0, 0, 1],
    };
  });

  afterEach(() => {
    while (mounted.length > 0) {
      mounted.pop()?.();
    }
    vi.clearAllMocks();
    mocks.atomValues.clear();
  });

  it("starts inactive", () => {
    const { result } = setup();

    expect(result.current.isHovered).toBe(false);
    expect(result.current.isDragging).toBe(false);
    expect(result.current.isActive).toBe(false);
    expect(result.current.targetFace).toBeNull();
  });

  it("tracks hover and reports it as active", () => {
    const { result, onArrowEnter } = setup();

    act(() => {
      result.current.handlers.onPointerOver({
        stopPropagation: vi.fn(),
      } as never);
    });

    expect(result.current.isHovered).toBe(true);
    expect(result.current.isActive).toBe(true);
    // Lets the caller drop competing hover state (the face-resize handle).
    expect(onArrowEnter).toHaveBeenCalledTimes(1);
  });

  it("ignores a grab when disabled", () => {
    const { result, onDragStart } = setup({ enabled: false });
    const { event } = makePointerDownEvent();

    act(() => {
      result.current.handlers.onPointerDown(event);
    });

    expect(result.current.isDragging).toBe(false);
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it("captures the pointer and signals the drag start on grab", () => {
    const { result, onDragStart, suppressNextClickRef } = setup();
    const { event, nativeEvent, pointerTarget } = makePointerDownEvent();

    act(() => {
      result.current.handlers.onPointerDown(event);
    });

    expect(result.current.isDragging).toBe(true);
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(pointerTarget.setPointerCapture).toHaveBeenCalledWith(7);
    // The click that follows the drag must not also select/deselect.
    expect(suppressNextClickRef.current).toBe(true);
    expect(nativeEvent.preventDefault).toHaveBeenCalled();
  });

  it("publishes the picked face while dragging", () => {
    const { result } = setup();
    const { event } = makePointerDownEvent();

    act(() => {
      result.current.handlers.onPointerDown(event);
    });
    firePointerMove();

    expect(result.current.targetFace).toBe("+z");
  });

  it("commits the relabel on release", () => {
    const { result, onCommit, onCancel } = setup();
    const { event } = makePointerDownEvent();

    act(() => {
      result.current.handlers.onPointerDown(event);
    });
    firePointerMove();
    firePointerUp();

    expect(onCommit).toHaveBeenCalledTimes(1);
    // Base dimensions are the drag-start snapshot, then the relabel result.
    expect(onCommit).toHaveBeenCalledWith(DIMENSIONS, [2, 6, 4], [0, 0, 0, 1]);
    expect(onCancel).not.toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
    expect(result.current.targetFace).toBeNull();
  });

  it("cancels instead of committing when released without a target", () => {
    mocks.pickedFace = null;
    const { result, onCommit, onCancel } = setup();
    const { event } = makePointerDownEvent();

    act(() => {
      result.current.handlers.onPointerDown(event);
    });
    firePointerMove();
    firePointerUp();

    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels when the drop lands back on the current heading face", () => {
    // computeCuboidHeadingRelabel returns null for a no-op relabel, which must
    // not write an empty undo entry.
    mocks.relabel = null;
    const { result, onCommit, onCancel } = setup();
    const { event } = makePointerDownEvent();

    act(() => {
      result.current.handlers.onPointerDown(event);
    });
    firePointerMove();
    firePointerUp();

    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("releases pointer capture on drop", () => {
    const { result } = setup();
    const { event, pointerTarget } = makePointerDownEvent();

    act(() => {
      result.current.handlers.onPointerDown(event);
    });
    firePointerUp();

    expect(pointerTarget.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it("commits exactly once even though pointer-move fires repeatedly", () => {
    // Regression guard: the target face used to live in state that the
    // window-listener effect depended on, so every move retriggered the effect
    // and its cleanup committed mid-drag.
    const { result, onCommit } = setup();
    const { event } = makePointerDownEvent();

    act(() => {
      result.current.handlers.onPointerDown(event);
    });
    firePointerMove();
    firePointerMove();
    firePointerMove();

    expect(onCommit).not.toHaveBeenCalled();

    firePointerUp();

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps the grab when the pointer leaves the arrow mid-drag", () => {
    const { result } = setup();
    const { event } = makePointerDownEvent();

    act(() => {
      result.current.handlers.onPointerOver({
        stopPropagation: vi.fn(),
      } as never);
      result.current.handlers.onPointerDown(event);
    });

    act(() => {
      result.current.handlers.onPointerOut({
        stopPropagation: vi.fn(),
      } as never);
    });

    // A drag swings the cursor well clear of the arrow; dropping hover there
    // would revoke the gate mid-gesture.
    expect(result.current.isHovered).toBe(true);
    expect(result.current.isDragging).toBe(true);
  });

  it("drops hover once the pointer leaves outside a drag", () => {
    const { result } = setup();

    act(() => {
      result.current.handlers.onPointerOver({
        stopPropagation: vi.fn(),
      } as never);
    });
    act(() => {
      result.current.handlers.onPointerOut({
        stopPropagation: vi.fn(),
      } as never);
    });

    expect(result.current.isHovered).toBe(false);
  });

  it("clears hover when it stops being editable", () => {
    const { result, rerender, options } = setup();

    act(() => {
      result.current.handlers.onPointerOver({
        stopPropagation: vi.fn(),
      } as never);
    });
    expect(result.current.isHovered).toBe(true);

    rerender({ ...options, enabled: false });

    expect(result.current.isHovered).toBe(false);
  });

  it("commits on unmount mid-drag rather than leaving the gesture dangling", () => {
    const { result, unmount, onCommit } = setup();
    const { event } = makePointerDownEvent();

    act(() => {
      result.current.handlers.onPointerDown(event);
    });
    firePointerMove();

    unmount();

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("stops publishing once the content group is gone", () => {
    const { result, contentRef } = setup();
    const { event } = makePointerDownEvent();

    act(() => {
      result.current.handlers.onPointerDown(event);
    });

    contentRef.current = null as never;
    firePointerMove();

    expect(result.current.targetFace).toBeNull();
  });
});
