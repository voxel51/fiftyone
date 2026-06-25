import type { CameraControls } from "@react-three/drei";
import { renderHook } from "@testing-library/react-hooks";
import type { RefObject } from "react";
import type { PerspectiveCamera, Vector3Tuple } from "three";
import { Vector3 } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFo3dCameraInitialization } from "../../hooks/use-fo3d-camera-initialization";
import { FO3D_CAMERA_LIFECYCLE_ACTION } from "../camera-lifecycle";
import { getSavedCameraState, saveCameraState } from "../utils";

const mockRecoilState = vi.hoisted(() => ({
  datasetNameAtom: { key: "test-datasetNameAtom" },
  datasetName: "test-dataset" as string | null,
  overriddenCameraPosition: null as [number, number, number] | null,
}));

vi.mock("@fiftyone/state", () => ({
  datasetName: mockRecoilState.datasetNameAtom,
}));

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");

  return {
    ...actual,
    useRecoilValue: (atom: { key?: string }) => {
      if (atom === mockRecoilState.datasetNameAtom) {
        return mockRecoilState.datasetName;
      }

      if (atom?.key === "fo3d-cameraPosition") {
        return mockRecoilState.overriddenCameraPosition;
      }

      return null;
    },
  };
});

vi.mock("../utils", () => ({
  getSavedCameraState: vi.fn(),
  saveCameraState: vi.fn(),
}));

type CameraHarness = {
  cameraRef: RefObject<PerspectiveCamera>;
  cameraControlsRef: RefObject<CameraControls>;
  setLookAt: ReturnType<typeof vi.fn>;
  getTarget: ReturnType<typeof vi.fn>;
};

const makeCameraHarness = (
  targetValue: [number, number, number] = [4, 5, 6],
): CameraHarness => {
  const setLookAt = vi.fn();
  const getTarget = vi.fn((target: Vector3) => {
    target.set(targetValue[0], targetValue[1], targetValue[2]);
    return target;
  });

  return {
    cameraRef: {
      current: {
        position: new Vector3(9, 8, 7),
      },
    } as unknown as RefObject<PerspectiveCamera>,
    cameraControlsRef: {
      current: {
        setLookAt,
        getTarget,
      },
    } as unknown as RefObject<CameraControls>,
    setLookAt,
    getTarget,
  };
};

const makeFoScene = (
  position: Vector3Tuple | null = [0, 0, 10],
  lookAt: Vector3Tuple | null = [0, 0, 0],
) =>
  ({
    cameraProps: {
      position,
      lookAt,
    },
  }) as unknown as Parameters<typeof useFo3dCameraInitialization>[0]["foScene"];

describe("useFo3dCameraInitialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecoilState.datasetName = "test-dataset";
    mockRecoilState.overriddenCameraPosition = null;
    vi.mocked(getSavedCameraState).mockReturnValue(null);
  });

  it("restores saved state immediately without waiting for bounds", () => {
    const { cameraRef, cameraControlsRef, setLookAt } = makeCameraHarness();
    const dispatchCameraLifecycle = vi.fn();

    vi.mocked(getSavedCameraState).mockReturnValue({
      position: [10, 20, 30],
      target: [1, 2, 3],
    });

    const { result } = renderHook(() =>
      useFo3dCameraInitialization({
        cameraRef,
        cameraControlsRef,
        currentRenderPath: "main",
        foScene: makeFoScene(),
        sceneBoundingBox: null,
        upVector: new Vector3(0, 1, 0),
        settings: null,
        isBoundsResolved: true,
        dispatchCameraLifecycle,
      }),
    );

    expect(result.current.mountCameraPosition.toArray()).toEqual([10, 20, 30]);
    expect(setLookAt).toHaveBeenCalledWith(10, 20, 30, 1, 2, 3, false);
    expect(dispatchCameraLifecycle).toHaveBeenLastCalledWith({
      type: FO3D_CAMERA_LIFECYCLE_ACTION.MARK_READY,
    });
  });

  it("defers fallback restore until bounds pipeline is resolved", () => {
    const { cameraRef, cameraControlsRef, setLookAt } = makeCameraHarness();
    const dispatchCameraLifecycle = vi.fn();

    const { rerender } = renderHook(
      ({ isBoundsResolved }: { isBoundsResolved: boolean }) =>
        useFo3dCameraInitialization({
          cameraRef,
          cameraControlsRef,
          currentRenderPath: "main",
          foScene: makeFoScene(null, null),
          sceneBoundingBox: null,
          upVector: new Vector3(0, 1, 0),
          settings: null,
          isBoundsResolved,
          dispatchCameraLifecycle,
        }),
      {
        initialProps: { isBoundsResolved: false },
      },
    );

    expect(setLookAt).not.toHaveBeenCalled();
    expect(dispatchCameraLifecycle).toHaveBeenLastCalledWith({
      type: FO3D_CAMERA_LIFECYCLE_ACTION.WAIT_FOR_BOUNDS,
    });

    rerender({ isBoundsResolved: false });
    expect(setLookAt).not.toHaveBeenCalled();
    expect(dispatchCameraLifecycle).toHaveBeenLastCalledWith({
      type: FO3D_CAMERA_LIFECYCLE_ACTION.WAIT_FOR_BOUNDS,
    });

    rerender({ isBoundsResolved: true });
    expect(setLookAt).toHaveBeenCalledTimes(1);
    expect(dispatchCameraLifecycle).toHaveBeenLastCalledWith({
      type: FO3D_CAMERA_LIFECYCLE_ACTION.MARK_READY,
    });

    const [, , , targetX, targetY, targetZ, animated] = setLookAt.mock.calls[0];
    expect(targetX).toBe(0);
    expect(targetY).toBe(0);
    expect(targetZ).toBe(0);
    expect(animated).toBe(false);
  });

  it("restores at most once per render path", () => {
    const { cameraRef, cameraControlsRef, setLookAt } = makeCameraHarness();
    const dispatchCameraLifecycle = vi.fn();

    vi.mocked(getSavedCameraState).mockReturnValue({
      position: [7, 8, 9],
      target: [0, 0, 0],
    });

    const { rerender } = renderHook(
      ({ currentRenderPath }: { currentRenderPath: "main" | "multi" }) =>
        useFo3dCameraInitialization({
          cameraRef,
          cameraControlsRef,
          currentRenderPath,
          foScene: makeFoScene(),
          sceneBoundingBox: null,
          upVector: new Vector3(0, 1, 0),
          settings: null,
          isBoundsResolved: true,
          dispatchCameraLifecycle,
        }),
      {
        initialProps: { currentRenderPath: "main" as const },
      },
    );

    expect(setLookAt).toHaveBeenCalledTimes(1);

    rerender({ currentRenderPath: "main" });
    expect(setLookAt).toHaveBeenCalledTimes(1);

    rerender({ currentRenderPath: "multi" });
    expect(setLookAt).toHaveBeenCalledTimes(2);
  });

  it("animates post-init override only when override changes after mount", () => {
    const { cameraRef, cameraControlsRef, setLookAt } = makeCameraHarness();
    const dispatchCameraLifecycle = vi.fn();

    mockRecoilState.overriddenCameraPosition = [1, 2, 3];

    const { rerender } = renderHook(() =>
      useFo3dCameraInitialization({
        cameraRef,
        cameraControlsRef,
        currentRenderPath: "main",
        foScene: makeFoScene(null, null),
        sceneBoundingBox: null,
        upVector: new Vector3(0, 1, 0),
        settings: null,
        isBoundsResolved: true,
        dispatchCameraLifecycle,
      }),
    );

    const initialAnimatedCalls = setLookAt.mock.calls.filter(
      (call) => call[6] === true,
    );
    expect(initialAnimatedCalls).toHaveLength(0);

    mockRecoilState.overriddenCameraPosition = [4, 5, 6];
    rerender();

    expect(setLookAt).toHaveBeenCalledWith(4, 5, 6, 0, 0, 0, true);
  });

  it("uses non-degenerate target for origin override when current target is colocated", () => {
    const { cameraRef, cameraControlsRef, setLookAt } = makeCameraHarness([
      0, 0, 0,
    ]);
    const dispatchCameraLifecycle = vi.fn();

    mockRecoilState.overriddenCameraPosition = [1, 2, 3];

    const { rerender } = renderHook(() =>
      useFo3dCameraInitialization({
        cameraRef,
        cameraControlsRef,
        currentRenderPath: "main",
        foScene: makeFoScene(null, null),
        sceneBoundingBox: null,
        upVector: new Vector3(0, 1, 0),
        settings: null,
        isBoundsResolved: true,
        dispatchCameraLifecycle,
      }),
    );

    mockRecoilState.overriddenCameraPosition = [0, 0, 0];
    rerender();

    expect(setLookAt).toHaveBeenCalledWith(0, 0, 0, 0, 0, 1, true);
  });

  it("persists camera state on cleanup", () => {
    const { cameraRef, cameraControlsRef } = makeCameraHarness();
    const dispatchCameraLifecycle = vi.fn();
    mockRecoilState.datasetName = "cleanup-dataset";

    const { unmount } = renderHook(() =>
      useFo3dCameraInitialization({
        cameraRef,
        cameraControlsRef,
        currentRenderPath: "main",
        foScene: makeFoScene(),
        sceneBoundingBox: null,
        upVector: new Vector3(0, 1, 0),
        settings: null,
        isBoundsResolved: true,
        dispatchCameraLifecycle,
      }),
    );

    unmount();

    expect(saveCameraState).toHaveBeenCalledWith(
      "cleanup-dataset",
      [9, 8, 7],
      [4, 5, 6],
    );
  });
});
