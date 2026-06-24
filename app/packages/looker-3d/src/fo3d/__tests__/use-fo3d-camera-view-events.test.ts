import { renderHook } from "@testing-library/react-hooks";
import type { RefObject } from "react";
import type { Box3, PerspectiveCamera } from "three";
import { Box3 as ThreeBox3, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SET_EGO_VIEW_EVENT, SET_TOP_VIEW_EVENT } from "../../constants";
import { useFo3dCameraViewEvents } from "../../hooks/use-fo3d-camera-view-events";
import type { Fo3dCameraControls } from "../camera-controls";

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
  cameraControlsRef: RefObject<Fo3dCameraControls>;
  update: ReturnType<typeof vi.fn>;
};

const makeCameraHarness = (): CameraHarness => {
  const update = vi.fn();

  return {
    cameraRef: {
      current: {
        position: new Vector3(3, 2, 1),
      },
    } as unknown as RefObject<PerspectiveCamera>,
    cameraControlsRef: {
      current: {
        target: new Vector3(0, 0, 0),
        update,
      },
    } as unknown as RefObject<Fo3dCameraControls>,
    update,
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
    const { cameraRef, cameraControlsRef, update } = makeCameraHarness();
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
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("recomputes bounds and defers top-view action when bbox is missing", () => {
    const { cameraRef, cameraControlsRef, update } = makeCameraHarness();
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
    expect(update).not.toHaveBeenCalled();

    vi.advanceTimersByTime(49);
    expect(update).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("cleans up deferred view commands on unmount", () => {
    const { cameraRef, cameraControlsRef, update } = makeCameraHarness();
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

    expect(update).not.toHaveBeenCalled();
  });

  it("uses operator override precedence for ego-view events", () => {
    const { cameraRef, cameraControlsRef, update } = makeCameraHarness();
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

    expect(update).toHaveBeenCalledTimes(1);
    expect(cameraRef.current?.position.toArray()).toEqual([4, 5, 6]);
  });
});
