import { renderHook } from "@testing-library/react";
import { PerspectiveCamera } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAMERA_POSITION_EVENT } from "../constants";
import { useAnnounceCameraPosition } from "./use-announce-camera-position";

const { afterEffects, dispatch } = vi.hoisted(() => ({
  afterEffects: new Set<() => void>(),
  dispatch: vi.fn(),
}));

vi.mock("@react-three/fiber", () => ({
  addAfterEffect: (callback: () => void) => {
    afterEffects.add(callback);
    return () => afterEffects.delete(callback);
  },
}));

vi.mock("@fiftyone/events", () => ({
  getEventBus: () => ({ dispatch }),
}));

const renderFrame = () => afterEffects.forEach((effect) => effect());

describe("useAnnounceCameraPosition", () => {
  beforeEach(() => {
    afterEffects.clear();
    dispatch.mockClear();
  });

  it("announces the first rendered position, then only changes", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(1, 2, 3);
    renderHook(() => useAnnounceCameraPosition({ current: camera }));

    renderFrame();
    renderFrame();
    expect(dispatch.mock.calls).toEqual([
      [CAMERA_POSITION_EVENT, { x: 1, y: 2, z: 3 }],
    ]);

    camera.position.set(4, 5, 6);
    renderFrame();
    expect(dispatch.mock.calls.at(-1)).toEqual([
      CAMERA_POSITION_EVENT,
      { x: 4, y: 5, z: 6 },
    ]);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("announces nothing before the camera mounts", () => {
    renderHook(() => useAnnounceCameraPosition({ current: null }));

    renderFrame();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("stops announcing once unmounted", () => {
    const camera = new PerspectiveCamera();
    const { unmount } = renderHook(() =>
      useAnnounceCameraPosition({ current: camera }),
    );

    unmount();
    renderFrame();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
