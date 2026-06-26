import type { CameraControls } from "@react-three/drei";
import { renderHook } from "@testing-library/react-hooks";
import type { RefObject } from "react";
import type { Box3, PerspectiveCamera } from "three";
import { Box3 as ThreeBox3, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SET_EGO_VIEW_EVENT, SET_TOP_VIEW_EVENT } from "../../constants";
import { useFo3dCameraViewEvents } from "../../hooks/use-fo3d-camera-view-events";

const hookState = vi.hoisted(() => ({
  overriddenCameraPosition: null as [number, number, number] | null,
  handlers: new Map<string, () => void>(),
}));

vi.mock("@fiftyone/state", () => ({
  useEventHandler: (
    _target: EventTarget | undefined,
    eventType: string,
    handler: () => void,
  ) => {
    hookState.handlers.set(eventType, handler);
  },
}));

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");

  return {
    ...actual,
    useRecoilValue: (atom: { key?: string }) => {
      if (atom?.key === "fo3d-cameraPosition") {
        return hookState.overriddenCameraPosition;
      }

      return null;
    },
  };
});

type CameraHarness = {
  cameraRef: RefObject<PerspectiveCamera>;
  cameraControlsRef: RefObject<CameraControls>;
  setLookAt: ReturnType<typeof vi.fn>;
};

const makeCameraHarness = (): CameraHarness => {
  const setLookAt = vi.fn();

  return {
    cameraRef: {
      current: {
        position: new Vector3(3, 2, 1),
      },
    } as unknown as RefObject<PerspectiveCamera>,
    cameraControlsRef: {
      current: {
        setLookAt,
      },
    } as unknown as RefObject<CameraControls>,
    setLookAt,
  };
};

const makeFoScene = (position: [number, number, number] | null = [0, 0, 10]) =>
  ({
    cameraProps: {
      position,
      lookAt: [0, 0, 0],
    },
  }) as any;

describe("useFo3dCameraViewEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    hookState.handlers.clear();
    hookState.overriddenCameraPosition = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles top-view event immediately when scene bbox is available", () => {
    const { cameraRef, cameraControlsRef, setLookAt } = makeCameraHarness();
    const recomputeBounds = vi.fn();
    const finiteBox = new ThreeBox3(
      new Vector3(-1, -1, -1),
      new Vector3(1, 1, 1),
    ) as Box3;

    renderHook(() =>
      useFo3dCameraViewEvents({
        cameraRef,
        cameraControlsRef,
        effectiveSceneBoundingBox: finiteBox,
        sceneBoundingBox: finiteBox,
        upVector: new Vector3(0, 1, 0),
        foScene: makeFoScene(),
        settings: null,
        recomputeBounds,
      }),
    );

    const topHandler = hookState.handlers.get(SET_TOP_VIEW_EVENT);
    expect(topHandler).toBeDefined();

    topHandler?.();

    expect(recomputeBounds).not.toHaveBeenCalled();
    expect(setLookAt).toHaveBeenCalledTimes(1);
    expect(setLookAt.mock.calls[0][6]).toBe(true);
  });

  it("recomputes bounds and defers top-view action when bbox is missing", () => {
    const { cameraRef, cameraControlsRef, setLookAt } = makeCameraHarness();
    const recomputeBounds = vi.fn();
    const effectiveBox = new ThreeBox3(
      new Vector3(-2, -2, -2),
      new Vector3(2, 2, 2),
    ) as Box3;

    renderHook(() =>
      useFo3dCameraViewEvents({
        cameraRef,
        cameraControlsRef,
        effectiveSceneBoundingBox: effectiveBox,
        sceneBoundingBox: null,
        upVector: new Vector3(0, 1, 0),
        foScene: makeFoScene(),
        settings: null,
        recomputeBounds,
      }),
    );

    const topHandler = hookState.handlers.get(SET_TOP_VIEW_EVENT);
    expect(topHandler).toBeDefined();

    topHandler?.();

    expect(recomputeBounds).toHaveBeenCalledTimes(1);
    expect(setLookAt).not.toHaveBeenCalled();

    vi.advanceTimersByTime(49);
    expect(setLookAt).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(setLookAt).toHaveBeenCalledTimes(1);
  });

  it("cleans up deferred view commands on unmount", () => {
    const { cameraRef, cameraControlsRef, setLookAt } = makeCameraHarness();
    const recomputeBounds = vi.fn();
    const effectiveBox = new ThreeBox3(
      new Vector3(-2, -2, -2),
      new Vector3(2, 2, 2),
    ) as Box3;

    const { unmount } = renderHook(() =>
      useFo3dCameraViewEvents({
        cameraRef,
        cameraControlsRef,
        effectiveSceneBoundingBox: effectiveBox,
        sceneBoundingBox: null,
        upVector: new Vector3(0, 1, 0),
        foScene: makeFoScene(),
        settings: null,
        recomputeBounds,
      }),
    );

    const topHandler = hookState.handlers.get(SET_TOP_VIEW_EVENT);
    expect(topHandler).toBeDefined();

    topHandler?.();
    expect(recomputeBounds).toHaveBeenCalledTimes(1);

    unmount();
    vi.advanceTimersByTime(50);

    expect(setLookAt).not.toHaveBeenCalled();
  });

  it("uses operator override precedence for ego-view events", () => {
    const { cameraRef, cameraControlsRef, setLookAt } = makeCameraHarness();
    hookState.overriddenCameraPosition = [4, 5, 6];
    const recomputeBounds = vi.fn();
    const finiteBox = new ThreeBox3(
      new Vector3(-1, -1, -1),
      new Vector3(1, 1, 1),
    ) as Box3;

    renderHook(() =>
      useFo3dCameraViewEvents({
        cameraRef,
        cameraControlsRef,
        effectiveSceneBoundingBox: finiteBox,
        sceneBoundingBox: finiteBox,
        upVector: new Vector3(0, 1, 0),
        foScene: makeFoScene([9, 9, 9]),
        settings: null,
        recomputeBounds,
      }),
    );

    const egoHandler = hookState.handlers.get(SET_EGO_VIEW_EVENT);
    expect(egoHandler).toBeDefined();

    egoHandler?.();

    expect(setLookAt).toHaveBeenCalledTimes(1);
    expect(setLookAt.mock.calls[0][0]).toBe(4);
    expect(setLookAt.mock.calls[0][1]).toBe(5);
    expect(setLookAt.mock.calls[0][2]).toBe(6);
    expect(setLookAt.mock.calls[0][6]).toBe(true);
  });
});
